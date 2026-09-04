module.exports = function registerCollabRoutes({
  app,
  mongoose,
  authenticateToken,
  generateId,
  User,
  Project,
  Pin,
  Group,
  Message,
  AnnotationIssue,
  AnnotationMessage,
  Subscription,
  FREE_EMAILS
}) {
  const getProjectGroupObjectIds = (project) => {
    const ids = [];
    if (project?.groupIds && Array.isArray(project.groupIds)) {
      for (const g of project.groupIds) {
        if (!g) continue;
        if (!ids.some(x => x.toString() === g.toString())) ids.push(g);
      }
    }
    if (project?.groupId) {
      const g = project.groupId;
      if (!ids.some(x => x.toString() === g.toString())) ids.push(g);
    }
    return ids;
  };

  const findProjectGroupsPopulated = async (project) => {
    const ids = getProjectGroupObjectIds(project);
    if (ids.length === 0) return [];
    const groups = await Group.find({ _id: { $in: ids } })
      .populate('members.userId', 'name email')
      .populate('createdBy', 'name email')
      .lean();
    const seen = new Set();
    return groups.filter(g => {
      const k = g._id.toString();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const checkProjectAccess = async (project, userId) => {
    const userIdStr = userId.toString();
    if (project.userId.toString() === userIdStr) return true;
    if (project.assignedUserIds && project.assignedUserIds.some(id => id.toString() === userIdStr)) return true;
    const groupObjectIds = getProjectGroupObjectIds(project);
    if (groupObjectIds.length) {
      const userObjId = new mongoose.Types.ObjectId(userId);
      const groups = await Group.find({ _id: { $in: groupObjectIds } }).select('members createdBy').lean();
      return groups.some(g =>
        g.members.some(m => m.userId.toString() === userIdStr) ||
        (g.createdBy && g.createdBy.toString() === userObjId.toString())
      );
    }
    return false;
  };

  // ==================== GET /projects - LIGHTWEIGHT SUMMARY ====================

app.get('/projects', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userObjId = new mongoose.Types.ObjectId(userId);

    // Only fetch group IDs.
    const userGroups = await Group.find({
      $or: [
        { 'members.userId': userObjId },
        { createdBy: userObjId }
      ]
    })
      .select('_id')
      .lean();

    const groupIds = userGroups.map(
      group => group._id
    );

    const projects = await Project.aggregate([
      {
        $match: {
          $or: [
            { userId: userObjId },
            { groupId: { $in: groupIds } },
            { groupIds: { $in: groupIds } },
            { assignedUserIds: userObjId }
          ]
        }
      },

      {
        $sort: {
          createdAt: -1
        }
      },

      {
        $project: {
          _id: 0,

          id: 1,
          userId: 1,
          name: 1,
          clientName: 1,
          websiteUrl: 1,
          groupId: 1,
          groupIds: 1,
          mode: 1,
          assignedUserIds: 1,
          status: 1,
          createdAt: 1,

          pageCount: {
            $size: {
              $ifNull: ['$pages', []]
            }
          },
        }
      }
    ]);

    res.json(projects);
  } catch (error) {
    console.error(
      '[Get Projects Summary] Error:',
      error
    );

    res.status(500).json({
      error: 'Server error'
    });
  }
});

// ==================== GET /projects/previews - BACKGROUND PREVIEWS ====================

app.get('/projects/previews', authenticateToken, async (req, res) => {
  try {
    const rawIds = (req.query.ids || '').toString();

    if (!rawIds.trim()) {
      return res.json([]);
    }

    const ids = [
      ...new Set(
        rawIds
          .split(',')
          .map(id => id.trim())
          .filter(Boolean)
      )
    ];

    if (!ids.length) {
      return res.json([]);
    }

    const userId = req.user.id;
    const userObjId = new mongoose.Types.ObjectId(userId);

    // Only return projects the current user can access.
    const userGroups = await Group.find({
      $or: [
        { 'members.userId': userObjId },
        { createdBy: userObjId }
      ]
    })
      .select('_id')
      .lean();

    const groupIds = userGroups.map(group => group._id);

    const previews = await Project.aggregate([
      {
        $match: {
          id: { $in: ids },
          $or: [
            { userId: userObjId },
            { groupId: { $in: groupIds } },
            { groupIds: { $in: groupIds } },
            { assignedUserIds: userObjId }
          ]
        }
      },
      {
        $project: {
          _id: 0,
          id: 1,
          coverImageUrl: {
            $arrayElemAt: ['$pages.imageUrl', 0]
          }
        }
      }
    ]);

    res.set(
      'Cache-Control',
      'private, max-age=300, stale-while-revalidate=600'
    );

    res.json(previews);
  } catch (error) {
    console.error('[Get Project Previews] Error:', error);

    res.status(500).json({
      error: 'Server error'
    });
  }
});

  // ==================== OVERRIDE: POST /projects (support groupId + mode) ====================

  app.post('/projects', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const userEmail = req.user.email;
      const { name, clientName, websiteUrl, initialPageUrl, groupId, mode = 'present' } = req.body;

      // Check subscription (skip for special emails)
      if (FREE_EMAILS[userEmail] !== 'skip') {
        const [activeSubscription, pendingSubscription, expiredSubscription] = await Promise.all([
          Subscription.findOne({
            userId,
            status: 'active',
            expiresAt: { $gt: new Date() }
          }).lean(),
          Subscription.findOne({
            userId,
            status: 'pending_verification'
          }).lean(),
          Subscription.findOne({
            userId,
            status: { $in: ['active', 'expired'] },
            expiresAt: { $lte: new Date() }
          }).lean()
        ]);

        if (!activeSubscription) {
          if (pendingSubscription) return res.status(403).json({ error: 'Payment verification pending', pendingVerification: true });
          if (expiredSubscription) return res.status(403).json({ error: 'Subscription expired', isExpired: true });
          return res.status(403).json({
            error: 'Active subscription required',
            requiresSubscription: true
          });
        }
      }

      const projectId = generateId();

      let resolvedGroupId = undefined;
      if (groupId && groupId !== 'none') {
        const group = await Group.findOne({ id: groupId });
        if (group) {
          resolvedGroupId = group._id;
        }
      }

      const project = new Project({
        id: projectId,
        userId,
        name,
        clientName,
        websiteUrl,
        groupId: resolvedGroupId,
        groupIds: resolvedGroupId ? [resolvedGroupId] : [],
        mode: mode || 'present',
        pages: [{
          id: generateId(),
          name: 'Main Page',
          imageUrl: initialPageUrl,
          originalUrl: websiteUrl
        }],
        status: 'DRAFT'
      });

      await project.save();

      if (resolvedGroupId) {
        const group = await Group.findById(resolvedGroupId);
        if (group && !group.projectIds.includes(projectId)) {
          group.projectIds.push(projectId);
          await group.save();
        }
      }

      console.log('[Project] Created:', projectId);
      res.status(201).json(project);

    } catch (error) {
      console.error('[Create Project] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ==================== OVERRIDE: DELETE /pins/:pinId (clean up annotations) ====================

  app.delete('/pins/:pinId', authenticateToken, async (req, res) => {
    try {
      const { pinId } = req.params;

      const pin = await Pin.findOneAndDelete({ id: pinId });
      if (!pin) {
        return res.status(404).json({ error: 'Pin not found' });
      }

      // Delete annotation issues and their messages when pin is deleted
      const issues = await AnnotationIssue.find({ pinId: pin.id });
      const issueIds = issues.map(i => i._id);
      if (issueIds.length > 0) {
        await AnnotationMessage.deleteMany({ annotationIssueId: { $in: issueIds } });
        await AnnotationIssue.deleteMany({ pinId: pin.id });
        console.log(`[Pin Delete] Cleaned up ${issues.length} annotation issues for pin ${pin.id}`);
      }

      // Reindex remaining pins for that project
      const projectPins = await Pin.find({ projectId: pin.projectId }).sort({ number: 1 });
      for (let i = 0; i < projectPins.length; i++) {
        projectPins[i].number = i + 1;
        await projectPins[i].save();
      }

      res.json({ message: 'Pin deleted' });

    } catch (error) {
      console.error('[Delete Pin] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
  app.get('/users/me', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id)
        .select(
          '_id name email phone timeZone workingTimeStart workingTimeEnd statusText about createdAt updatedAt isLocalComputeEnabled'
        )
        .lean();

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      res.json(user);
    } catch (error) {
      console.error('[Users Me] Error:', error);

      res.status(500).json({
        error: 'Server error'
      });
    }
  });

  app.get('/users/me/avatar', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id)
        .select('_id avatarUrl')
        .lean();

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      res.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');

      res.json({
        _id: user._id,
        avatarUrl: user.avatarUrl || ''
      });
    } catch (error) {
      console.error('[Users Me Avatar] Error:', error);

      res.status(500).json({
        error: 'Server error'
      });
    }
  });

  app.get('/users/me/avatar/placeholder', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id)
        .select('_id avatarPlaceholderUrl')
        .lean();

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      res.set(
        'Cache-Control',
        'private, max-age=2592000, stale-while-revalidate=86400'
      );

      res.json({
        _id: user._id,
        avatarPlaceholderUrl: user.avatarPlaceholderUrl || ''
      });
    } catch (error) {
      console.error('[Users Me Avatar Placeholder] Error:', error);

      res.status(500).json({
        error: 'Server error'
      });
    }
  });

  app.patch('/users/me', authenticateToken, async (req, res) => {
    try {
      const allowed = ['name', 'phone', 'timeZone', 'workingTimeStart', 'workingTimeEnd', 'statusText', 'about', 'avatarUrl', 'avatarPlaceholderUrl'];
      const updates = {};
      for (const k of allowed) {
        if (!(k in req.body)) continue;
        const v = req.body[k];
        if (v === null || v === undefined) { updates[k] = ''; continue; }
        if (typeof v !== 'string') continue;
        if (k === 'avatarUrl') {
          if (v.length > 600000) continue;
        }
        if (k === 'avatarPlaceholderUrl') {
          if (v.length > 15000) continue;
        }
        updates[k] = v;
      }
      updates.updatedAt = new Date();
      const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).select('_id name email phone timeZone workingTimeStart workingTimeEnd statusText about avatarUrl createdAt updatedAt isLocalComputeEnabled');
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (error) {
      console.error('[Users Me Patch] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ==================== USER SEARCH ROUTE ====================

    app.get('/users/avatars', authenticateToken, async (req, res) => {
      try {
        const rawIds = (req.query.ids || '').toString();

        if (!rawIds.trim()) {
          return res.json([]);
        }

        const ids = [
          ...new Set(
            rawIds
              .split(',')
              .map(id => id.trim())
              .filter(id => mongoose.Types.ObjectId.isValid(id))
          )
        ];

        if (!ids.length) {
          return res.json([]);
        }

        const users = await User.find({
          _id: {
            $in: ids
          }
        })
          .select('_id avatarPlaceholderUrl')
          .lean();

        res.set(
          'Cache-Control',
          'private, max-age=2592000, stale-while-revalidate=86400'
        );

        res.json(
          users.map(user => ({
            _id: user._id,
            avatarUrl: user.avatarPlaceholderUrl  || ''
          }))
        );
      } catch (error) {
        console.error('[User Avatars] Error:', error);
        res.status(500).json({
          error: 'Server error'
        });
      }
    });

    app.get('/users/avatars/full', authenticateToken, async (req, res) => {
      try {
        const rawIds = (req.query.ids || '').toString();

        if (!rawIds.trim()) {
          return res.json([]);
        }

        const ids = [
          ...new Set(
            rawIds
              .split(',')
              .map(id => id.trim())
              .filter(id => mongoose.Types.ObjectId.isValid(id))
          )
        ];

        if (!ids.length) {
          return res.json([]);
        }

        const users = await User.find({
          _id: { $in: ids }
        })
          .select('_id avatarUrl')
          .lean();

        res.set(
          'Cache-Control',
          'private, max-age=2592000, stale-while-revalidate=86400'
        );

        res.json(
          users.map(user => ({
            _id: user._id,
            avatarUrl: user.avatarUrl || ''
          }))
        );
      } catch (error) {
        console.error('[User Full Avatars] Error:', error);

        res.status(500).json({
          error: 'Server error'
        });
      }
    });

  app.get('/users/search', authenticateToken, async (req, res) => {
    try {
      const { email } = req.query;
      const userId = req.user.id;
      const queryText = (email || '').toString().trim();

      const userObjectId = new mongoose.Types.ObjectId(userId);
      const accessibleGroups = await Group.find({
        $or: [{ 'members.userId': userObjectId }, { createdBy: userObjectId }]
      }).select('_id members createdBy');

      const groupMemberIds = new Set(accessibleGroups.flatMap(group => [
        ...group.members.map(member => member.userId.toString()),
        group.createdBy?.toString()
      ].filter(Boolean)));

      const searchQuery = {
        _id: { $in: [...groupMemberIds].map(id => new mongoose.Types.ObjectId(id)) }
      };

      if (queryText) {
        searchQuery.$or = [
          { email: { $regex: queryText, $options: 'i' } },
          { name: { $regex: queryText, $options: 'i' } }
        ];
      }

      const users = await User.find(searchQuery).select('_id name email avatarUrl').limit(20).lean();

      res.json(users);
    } catch (error) {
      console.error('[User Search] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/users/all', authenticateToken, async (req, res) => {
    try {
      const users = await User.find({}).select('_id name email').lean();
      res.json(users);
    } catch (error) {
      console.error('[Users All] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ==================== GROUP ROUTES ====================

  app.get('/groups', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const groups = await Group.find({
        $or: [
          { 'members.userId': new mongoose.Types.ObjectId(userId) },
          { createdBy: new mongoose.Types.ObjectId(userId) }
        ]
      })
        .populate('members.userId', 'name email')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      const normalized = groups.map(g => {
        const obj = g;
        const createdById = (obj.createdBy?._id || obj.createdBy)?.toString?.();
        if (createdById) {
          obj.members = (obj.members || []).map(m => {
            const memberId = (m.userId?._id || m.userId)?.toString?.();
            if (memberId && memberId === createdById) return { ...m, role: 'owner' };
            return m;
          });
        }
        return obj;
      });
      res.json(normalized);
    } catch (error) {
      console.error('[Get Groups] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/groups/:groupId', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;
      const group = await Group.findOne({ id: groupId })
        .populate('members.userId', 'name email')
        .populate('createdBy', 'name email')
        .lean()
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isMember = group.members.some(m => m.userId._id.toString() === userId) ||
        group.createdBy._id.toString() === userId;
      if (!isMember) return res.status(403).json({ error: 'Access denied' });
      const obj = group.toObject();
      const createdById = (obj.createdBy?._id || obj.createdBy)?.toString?.();
      if (createdById) {
        obj.members = (obj.members || []).map(m => {
          const memberId = (m.userId?._id || m.userId)?.toString?.();
          if (memberId && memberId === createdById) return { ...m, role: 'owner' };
          return m;
        });
      }
      res.json(obj);
    } catch (error) {
      console.error('[Get Group] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/groups', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, type, description, projectId } = req.body;
      if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
      if (!['team', 'client'].includes(type)) return res.status(400).json({ error: 'Invalid group type' });

      const groupId = generateId();
      const ownerObjectId = new mongoose.Types.ObjectId(userId);
      const group = new Group({
        id: groupId,
        name,
        type,
        description: description || '',
        createdBy: ownerObjectId,
        members: [{ userId: ownerObjectId, role: 'owner', designation: '' }],
        subgroups: [{ id: generateId(), name: 'General', createdBy: ownerObjectId }]
      });

      if (projectId) {
        const project = await Project.findOne({ id: projectId });
        if (project && !group.projectIds.includes(project.id)) {
          group.projectIds.push(project.id);
        }
      }

      await group.save();
      const populated = await Group.findOne({ id: groupId }).populate('members.userId', 'name email').populate('createdBy', 'name email').lean();
      console.log('[Group] Created:', groupId);
      res.status(201).json(populated);
    } catch (error) {
      console.error('[Create Group] Error:', error);
      res.status(500).json({ error: error.message || 'Server error' });
    }
  });

  app.patch('/groups/:groupId', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;
      const { name, description } = req.body;
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isOwnerOrAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      if (!isOwnerOrAdmin) return res.status(403).json({ error: 'Access denied' });
      if (name) group.name = name;
      if (description !== undefined) group.description = description;
      await group.save();
      const populated = await group.populate('members.userId', 'name email');
      res.json(populated);
    } catch (error) {
      console.error('[Update Group] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/groups/:groupId', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (group.createdBy.toString() !== userId) return res.status(403).json({ error: 'Only owner can delete group' });
      await Message.deleteMany({ groupId: group._id });
      await Project.updateMany({ groupId: group._id }, { $unset: { groupId: 1 } });
      await Group.deleteOne({ id: groupId });
      res.json({ message: 'Group deleted' });
    } catch (error) {
      console.error('[Delete Group] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/groups/:groupId/members', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;
      const { memberEmail, role = 'member', designation = '' } = req.body;
      if (!memberEmail) return res.status(400).json({ error: 'Member email is required' });
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isOwnerOrAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      if (!isOwnerOrAdmin) return res.status(403).json({ error: 'Access denied' });
      if (role === 'owner') return res.status(400).json({ error: 'Invalid role' });
      if (role === 'admin' && group.createdBy.toString() !== userId) return res.status(403).json({ error: 'Only group owner can assign admin role' });
      const memberUser = await User.findOne({ email: memberEmail.toLowerCase() });
      if (!memberUser) return res.status(404).json({ error: 'User not found. User must sign up first.' });
      const alreadyMember = group.members.some(m => m.userId.toString() === memberUser._id.toString());
      if (alreadyMember) return res.status(400).json({ error: 'User already in group' });
      group.members.push({ userId: memberUser._id, role: role || 'member', designation: designation || '' });
      await group.save();
      const populated = await group.populate('members.userId', 'name email');
      res.json(populated);
    } catch (error) {
      console.error('[Add Member] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/groups/:groupId/members/:memberId', authenticateToken, async (req, res) => {
    try {
      const { groupId, memberId } = req.params;
      const userId = req.user.id;
      const { role, designation } = req.body;
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isOwnerOrAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      if (!isOwnerOrAdmin) return res.status(403).json({ error: 'Access denied' });
      const member = group.members.find(m => m.userId.toString() === memberId);
      if (!member) return res.status(404).json({ error: 'Member not found in group' });
      if (role) {
        if (role === 'owner') return res.status(400).json({ error: 'Only the group creator can be owner' });
        if (group.createdBy.toString() !== userId) return res.status(403).json({ error: 'Only group owner can change roles' });
        if (group.createdBy.toString() === memberId) return res.status(400).json({ error: 'Cannot change owner role' });
        member.role = role;
      }
      if (designation !== undefined) member.designation = designation;
      await group.save();
      const populated = await group.populate('members.userId', 'name email');
      res.json(populated);
    } catch (error) {
      console.error('[Update Member] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/groups/:groupId/members/:memberId', authenticateToken, async (req, res) => {
    try {
      const { groupId, memberId } = req.params;
      const userId = req.user.id;
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isOwnerOrAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      if (!isOwnerOrAdmin && memberId !== userId) return res.status(403).json({ error: 'Access denied' });
      if (group.createdBy.toString() === memberId) return res.status(400).json({ error: 'Cannot remove group creator' });
      group.members = group.members.filter(m => m.userId.toString() !== memberId);
      await group.save();
      const populated = await group.populate('members.userId', 'name email');
      res.json(populated);
    } catch (error) {
      console.error('[Remove Member] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/groups/:groupId/subgroups', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ error: 'Subgroup name required' });
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isMember = group.members.some(m => m.userId.toString() === userId) ||
        group.createdBy.toString() === userId;
      if (!isMember) return res.status(403).json({ error: 'Access denied' });
      group.subgroups.push({ id: generateId(), name, description: (description || '').toString(), createdBy: new mongoose.Types.ObjectId(userId) });
      await group.save();
      res.json(group.subgroups);
    } catch (error) {
      console.error('[Create Subgroup] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/groups/:groupId/subgroups/:subgroupId', authenticateToken, async (req, res) => {
    try {
      const { groupId, subgroupId } = req.params;
      const userId = req.user.id;
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ error: 'Subgroup name required' });
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isOwnerOrAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      if (!isOwnerOrAdmin) return res.status(403).json({ error: 'Access denied' });
      const sg = group.subgroups.find(s => s.id === subgroupId);
      if (!sg) return res.status(404).json({ error: 'Subgroup not found' });
      sg.name = name;
      sg.description = (description || '').toString();
      await group.save();
      res.json(group.subgroups);
    } catch (error) {
      console.error('[Update Subgroup] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/groups/:groupId/subgroups/:subgroupId', authenticateToken, async (req, res) => {
    try {
      const { groupId, subgroupId } = req.params;
      const userId = req.user.id;
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const isOwnerOrAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      if (!isOwnerOrAdmin) return res.status(403).json({ error: 'Access denied' });
      group.subgroups = group.subgroups.filter(s => s.id !== subgroupId);
      await group.save();
      await Message.deleteMany({ groupId: group._id, subgroupId });
      res.json(group.subgroups);
    } catch (error) {
      console.error('[Delete Subgroup] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/groups/:groupId/projects/:projectId', authenticateToken, async (req, res) => {
    try {
      const { groupId, projectId } = req.params;
      const userId = req.user.id;
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const project = await Project.findOne({ id: projectId });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const isGroupAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      const isProjectOwner = project.userId.toString() === userId;
      if (!isGroupAdmin && !isProjectOwner) return res.status(403).json({ error: 'Access denied' });
      if (!group.projectIds.includes(projectId)) {
        group.projectIds.push(projectId);
        await group.save();
      }
      const nextGroupIds = getProjectGroupObjectIds(project);
      if (!nextGroupIds.some(x => x.toString() === group._id.toString())) nextGroupIds.push(group._id);
      project.groupIds = nextGroupIds;
      project.groupId = nextGroupIds[0] || undefined;
      await project.save();
      res.json({ success: true, project, group });
    } catch (error) {
      console.error('[Assign Project] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/groups/:groupId/projects/:projectId', authenticateToken, async (req, res) => {
    try {
      const { groupId, projectId } = req.params;
      const userId = req.user.id;
      const group = await Group.findOne({ id: groupId });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const project = await Project.findOne({ id: projectId });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const isGroupAdmin = group.createdBy.toString() === userId ||
        group.members.some(m => m.userId.toString() === userId && (m.role === 'owner' || m.role === 'admin'));
      const isProjectOwner = project.userId.toString() === userId;
      if (!isGroupAdmin && !isProjectOwner) return res.status(403).json({ error: 'Access denied' });
      group.projectIds = group.projectIds.filter(p => p !== projectId);
      await group.save();
      const remainingGroupIds = getProjectGroupObjectIds(project).filter(x => x.toString() !== group._id.toString());
      project.groupIds = remainingGroupIds;
      project.groupId = remainingGroupIds[0] || undefined;
      await project.save();
      res.json({ success: true });
    } catch (error) {
      console.error('[Unassign Project] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/projects/:projectId/assign-users', authenticateToken, async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      const { userIds } = req.body;
      const project = await Project.findOne({ id: projectId });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      let canAssign = project.userId.toString() === userId;
      if (!canAssign) {
        const groups = await findProjectGroupsPopulated(project);
        for (const g of groups) {
          const member = g.members.find(m => m.userId._id?.toString?.() === userId || m.userId.toString() === userId);
          if (!member) continue;
          const desig = (member.designation || '').toLowerCase();
          if (desig === 'pm' || desig === 'product manager' || member.role === 'owner' || member.role === 'admin') {
            canAssign = true;
            break;
          }
        }
      }
      if (!canAssign) return res.status(403).json({ error: 'Only PM or project owner can assign users' });
      project.assignedUserIds = userIds.map(id => new mongoose.Types.ObjectId(id));
      await project.save();
      res.json({ success: true, assignedUserIds: project.assignedUserIds });
    } catch (error) {
      console.error('[Assign Users Project] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/projects/:projectId/assignees', authenticateToken, async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      const project = await Project.findOne({ id: projectId })
        .select('id userId assignedUserIds groupId groupIds')
        .lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const userObjId = new mongoose.Types.ObjectId(userId);
      const userIdStr = userId.toString();

      let isProjectGroupMember = false;
      let isTeamMember = false;
      let canAssign = project.userId.toString() === userIdStr;
      let canCrossGroupSearch = canAssign;
      const projectAssignees = [];
      const seen = new Set();

      const projectGroups = await findProjectGroupsPopulated(project);

      for (const g of projectGroups) {
        if (g.type === 'team') isTeamMember = true;

        const gCreatedById = (g.createdBy?._id || g.createdBy)?.toString?.();
        const member = g.members.find(m => {
          const mid = (m.userId?._id || m.userId)?.toString?.();
          return mid === userIdStr;
        });
        const isMember = !!member || (gCreatedById && gCreatedById === userIdStr);

        if (isMember) {
          isProjectGroupMember = true;
          if (!canAssign && member) {
            const desig = (member.designation || '').toLowerCase();
            if (desig === 'pm' || desig === 'product manager' || member.role === 'owner' || member.role === 'admin') {
              canAssign = true;
              canCrossGroupSearch = true;
            }
          }
          if (!canCrossGroupSearch && member) {
            const desig = (member.designation || '').toLowerCase();
            if (desig === 'pm' || desig === 'product manager' || member.role === 'owner' || member.role === 'admin') {
              canCrossGroupSearch = true;
            }
          }
        }

        for (const m of g.members || []) {
          const uid = (m.userId._id || m.userId)?.toString?.();
          if (!uid || seen.has(uid)) continue;
          seen.add(uid);
          projectAssignees.push({
            _id: m.userId._id || m.userId,
            name: m.userId.name,
            email: m.userId.email,
            designation: m.designation,
            role: m.role,
            groupType: g.type,
            groupName: g.name
          });
        }
      }

      const ownerUser = await User.findById(project.userId).select('_id name email').lean();
      if (ownerUser && !seen.has(ownerUser._id.toString())) {
        seen.add(ownerUser._id.toString());
        projectAssignees.push({
          _id: ownerUser._id,
          name: ownerUser.name,
          email: ownerUser.email,
          designation: 'Owner',
          role: 'owner'
        });
      }

      const needTeamMemberCheck = !isTeamMember;
      const needCrossGroupFetch = canCrossGroupSearch;

      const projectGroupIds = new Set(projectGroups.map(g => g.id));
      const projectIdStr = project.id;

      const [teamGroupResult, allUserGroupsResult] = await Promise.all([
        needTeamMemberCheck
          ? Group.find({
              type: 'team',
              $or: [{ 'members.userId': userObjId }, { createdBy: userObjId }]
            }).select('_id').lean()
          : null,
        needCrossGroupFetch
          ? Group.find({
              $or: [{ 'members.userId': userObjId }, { createdBy: userObjId }]
            }).populate('members.userId', 'name email').lean()
          : null
      ]);

      if (needTeamMemberCheck) {
        isTeamMember = teamGroupResult.length > 0;
      }

      let otherGroups = [];
      if (needCrossGroupFetch) {
        otherGroups = allUserGroupsResult
          .filter(g => !projectGroupIds.has(g.id) && !(g.projectIds || []).includes(projectIdStr))
          .map(g => ({
            id: g.id,
            name: g.name,
            type: g.type,
            members: (g.members || []).map(m => ({
              _id: m.userId._id || m.userId,
              name: m.userId.name,
              email: m.userId.email,
              designation: m.designation,
              role: m.role,
              groupType: g.type,
              groupName: g.name
            }))
          }));
      }

      res.json({
        projectAssignees,
        otherGroups,
        permissions: {
          isProjectGroupMember,
          canAssign,
          canCrossGroupSearch,
          isTeamMember
        }
      });
    } catch (error) {
      console.error('[Get Assignees] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ==================== CHAT/MESSAGE ROUTES ====================

  app.get('/groups/:groupId/messages', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { subgroupId } = req.query;
      const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 500);
      const before = req.query.before;
      const userId = req.user.id;
      const group = await Group.findOne({ id: groupId }).select('_id members createdBy type').lean();
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const userIdStr = userId.toString();
      const isMember = group.members.some(m => m.userId.toString() === userIdStr) ||
        group.createdBy.toString() === userIdStr;
      if (!isMember) return res.status(403).json({ error: 'Access denied' });
      const userObjId = new mongoose.Types.ObjectId(userId);
      let isTeamMember = group.type === 'team';
      if (!isTeamMember) {
        const teamGroups = await Group.find({
          type: 'team', $or: [{ 'members.userId': userObjId }, { createdBy: userObjId }]
        }).select('_id').lean();
        isTeamMember = teamGroups.length > 0;
      }
      const query = { groupId: group._id };
      if (subgroupId) query.subgroupId = subgroupId.toString();
      else query.subgroupId = { $exists: false };
      if (!isTeamMember) query.visibility = 'all';

      let beforeDate = null;
      if (before) {
        const beforeMsg = await Message.findOne({ id: before.toString() }).select('createdAt').lean();
        if (beforeMsg && beforeMsg.createdAt) beforeDate = beforeMsg.createdAt;
        else {
          const parsed = Date.parse(before.toString());
          if (!isNaN(parsed)) beforeDate = new Date(parsed);
        }
      }

      if (beforeDate) query.createdAt = { $lt: beforeDate };

      const msgs = await Message.find(query)
        .populate('senderId', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
      const messages = msgs.reverse();
      res.json(messages);
    } catch (error) {
      console.error('[Get Group Messages] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/groups/:groupId/messages', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;
      const { subgroupId, content, visibility = 'all' } = req.body;
      if (!content) return res.status(400).json({ error: 'Content required' });
      const group = await Group.findOne({ id: groupId }).select('_id members createdBy').lean();
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const userIdStr = userId.toString();
      const isMember = group.members.some(m => m.userId.toString() === userIdStr) ||
        group.createdBy.toString() === userIdStr;
      if (!isMember) return res.status(403).json({ error: 'Access denied' });
      const msg = new Message({
        id: generateId(),
        groupId: group._id,
        subgroupId: subgroupId || undefined,
        senderId: new mongoose.Types.ObjectId(userId),
        content,
        visibility: visibility || 'all'
      });
      await msg.save();
      const populated = await msg.populate('senderId', 'name email');
      res.status(201).json(populated);
    } catch (error) {
      console.error('[Send Group Message] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

      app.get('/messages/direct/contacts', authenticateToken, async (req, res) => {
        try {
          const userId = new mongoose.Types.ObjectId(req.user.id);

          // ------------------------------------------------------------
          // STEP 1
          // Find only direct-message records involving this user.
          //
          // The two branches map directly to the two partial indexes
          // defined in Message.js.
          // ------------------------------------------------------------

          const [sentMessages, receivedMessages] = await Promise.all([
            Message.find({
              groupId: { $exists: false },
              directRecipientId: { $exists: true },
              senderId: userId
            })
              .select('directRecipientId createdAt')
              .sort({ createdAt: -1 })
              .lean(),

            Message.find({
              groupId: { $exists: false },
              directRecipientId: { $exists: true },
              directRecipientId: userId
            })
              .select('senderId createdAt')
              .sort({ createdAt: -1 })
              .lean()
          ]);

          // ------------------------------------------------------------
          // STEP 2
          // Build the latest message timestamp for each counterpart.
          //
          // Because each query is already sorted newest-first, the first
          // occurrence of a counterpart is its latest message.
          // ------------------------------------------------------------

          const latestByUser = new Map();

          for (const message of sentMessages) {
            const counterpartId = message.directRecipientId?.toString();
            if (!counterpartId || latestByUser.has(counterpartId)) continue;

            latestByUser.set(counterpartId, message.createdAt);
          }

          for (const message of receivedMessages) {
            const counterpartId = message.senderId?.toString();
            if (!counterpartId) continue;

            const existing = latestByUser.get(counterpartId);

            if (
              !existing ||
              new Date(message.createdAt).getTime() >
                new Date(existing).getTime()
            ) {
              latestByUser.set(counterpartId, message.createdAt);
            }
          }

          if (latestByUser.size === 0) {
            return res.json([]);
          }

          // ------------------------------------------------------------
          // STEP 3
          // Fetch only the tiny user fields required by the DM sidebar.
          //
          // IMPORTANT:
          // Do NOT load avatarUrl here.
          // avatarUrl can be a very large data URL in the current schema.
          // ------------------------------------------------------------

          const counterpartIds = Array.from(latestByUser.keys())
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

          const users = await User.find({
            _id: { $in: counterpartIds }
          })
            .select('_id name email')
            .lean();

          const userMap = new Map(
            users.map(user => [
              user._id.toString(),
              user
            ])
          );

          // ------------------------------------------------------------
          // STEP 4
          // Return exactly the information the frontend needs.
          // ------------------------------------------------------------

          const contacts = Array.from(latestByUser.entries())
            .map(([userIdString, lastMessageAt]) => {
              const user = userMap.get(userIdString);

              if (!user) return null;

              return {
                _id: user._id,
                name: user.name || 'User',
                email: user.email || '',
                lastMessageAt
              };
            })
            .filter(Boolean)
            .sort(
              (a, b) =>
                new Date(b.lastMessageAt).getTime() -
                new Date(a.lastMessageAt).getTime()
            );

          res.json(contacts);
        } catch (error) {
          console.error('[Direct Message Contacts] Error:', error);

          res.status(500).json({
            error: 'Server error'
          });
        }
      });
  
  app.get('/messages/direct/:recipientId', authenticateToken, async (req, res) => {
    try {
      const { recipientId } = req.params;
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 500);
      const before = req.query.before;

      const query = {
        $or: [
          { senderId: new mongoose.Types.ObjectId(userId), directRecipientId: new mongoose.Types.ObjectId(recipientId) },
          { senderId: new mongoose.Types.ObjectId(recipientId), directRecipientId: new mongoose.Types.ObjectId(userId) }
        ]
      };

      let beforeDate = null;
      if (before) {
        const beforeMsg = await Message.findOne({ id: before.toString() }).select('createdAt').lean();
        if (beforeMsg && beforeMsg.createdAt) beforeDate = beforeMsg.createdAt;
        else {
          const parsed = Date.parse(before.toString());
          if (!isNaN(parsed)) beforeDate = new Date(parsed);
        }
      }

      if (beforeDate) query.createdAt = { $lt: beforeDate };

      const msgs = await Message.find(query)
        .populate('senderId', 'name email').populate('directRecipientId', 'name email')
        .sort({ createdAt: -1 }).limit(limit).lean()
      const messages = msgs.reverse();
      res.json(messages);
    } catch (error) {
      console.error('[Get Direct Messages] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });


  app.post('/messages/direct/:recipientId', authenticateToken, async (req, res) => {
    try {
      const { recipientId } = req.params;
      const userId = req.user.id;
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: 'Content required' });
      const recipient = await User.findById(recipientId).select('_id').lean();
      if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
      const msg = new Message({
        id: generateId(),
        directRecipientId: new mongoose.Types.ObjectId(recipientId),
        senderId: new mongoose.Types.ObjectId(userId),
        content,
        visibility: 'all'
      });
      await msg.save();
      const populated = await msg.populate('senderId', 'name email');
      res.status(201).json(populated);
    } catch (error) {
      console.error('[Send Direct Message] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ==================== ANNOTATION ISSUE ROUTES ====================

  app.get('/projects/:projectId/issues', authenticateToken, async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      const project =
        await Project.findOne({ id: projectId })
          .select(
            'id userId assignedUserIds groupId groupIds'
          )
          .lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const hasAccess = await checkProjectAccess(project, userId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
      const issues = await AnnotationIssue.find({ projectId })
        .populate('assigneeId', 'name email')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      res.json(issues);
    } catch (error) {
      console.error('[Get Project Issues] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/pins/:pinId/issue', authenticateToken, async (req, res) => {
    try {
      const { pinId } = req.params;
      const userId = req.user.id;
      const issue = await AnnotationIssue.findOne({ pinId })
        .populate('assigneeId', 'name email')
        .populate('createdBy', 'name email')
        .populate('assignmentHistory.fromUserId', 'name email')
        .populate('assignmentHistory.toUserId', 'name email')
        .lean();
      if (!issue) return res.json(null);
      const project = await Project.findOne({ id: issue.projectId })
        .select('id userId assignedUserIds groupId groupIds')
        .lean();
      if (!project) return res.json(null);
      const hasAccess = await checkProjectAccess(project, userId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
      res.json(issue);
    } catch (error) {
      console.error('[Get Pin Issue] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/pins/:pinId/issue', authenticateToken, async (req, res) => {
    try {
      const { pinId } = req.params;
      const userId = req.user.id;
      const { projectId, assigneeId, status, labels } = req.body;
      let issue = await AnnotationIssue.findOne({ pinId });
      if (issue) {
        const project = await Project.findOne({ id: issue.projectId })
          .select('id userId assignedUserIds groupId groupIds')
          .lean();
        if (!project) return res.status(404).json({ error: 'Project not found' });

        let canEdit = project.userId.toString() === userId;
        if (issue.assigneeId && issue.assigneeId.toString() === userId) {
          canEdit = true;
        }
        if (!canEdit && issue.createdBy && issue.createdBy.toString() === userId) {
          canEdit = true;
        }
        if (!canEdit && project.assignedUserIds && project.assignedUserIds.some(id => id.toString() === userId)) {
          canEdit = true;
        }

        if (!canEdit) {
          const groups = await findProjectGroupsPopulated(project);
          for (const g of groups) {
            const member = g.members.find(m => m.userId?._id?.toString?.() === userId || m.userId.toString() === userId);
            if (!member) continue;
            const desig = (member.designation || '').toLowerCase();
            if (desig === 'pm' || desig === 'product manager' || desig === 'qa' || desig === 'tester' || desig === 'quality assurance' || member.role === 'owner' || member.role === 'admin') {
              canEdit = true;
              break;
            }
          }
        }

        if (!canEdit) return res.status(403).json({ error: 'Only PM, QA, Tester, project owner, issue creator, or assignee can edit issue' });

        const prevAssigneeId = issue.assigneeId ? issue.assigneeId.toString() : '';
        const prevStatus = issue.status;
        let assigneeDidChange = false;
        if (assigneeId !== undefined) {
          const nextAssigneeId = assigneeId ? assigneeId.toString() : '';
          if (nextAssigneeId && nextAssigneeId !== prevAssigneeId) {
            if (!issue.assignmentHistory) issue.assignmentHistory = [];
            issue.assignmentHistory.push({
              fromUserId: issue.assigneeId ? issue.assigneeId : issue.createdBy,
              toUserId: new mongoose.Types.ObjectId(nextAssigneeId),
              status: status !== undefined ? status : issue.status,
              at: new Date()
            });
            assigneeDidChange = true;
          }
          issue.assigneeId = assigneeId ? new mongoose.Types.ObjectId(assigneeId) : undefined;
        }
        if (status !== undefined && status !== prevStatus && !assigneeDidChange) {
          if (!issue.assignmentHistory) issue.assignmentHistory = [];
          issue.assignmentHistory.push({
            fromUserId: issue.assigneeId ? issue.assigneeId : issue.createdBy,
            toUserId: issue.assigneeId ? issue.assigneeId : issue.createdBy,
            status,
            at: new Date()
          });
        }
        if (status !== undefined) issue.status = status;
        if (labels) issue.labels = labels;
        await issue.save();
        const populated = await issue.populate([
          { path: 'assigneeId', select: 'name email' },
          { path: 'createdBy', select: 'name email' },
          { path: 'assignmentHistory.fromUserId', select: 'name email' },
          { path: 'assignmentHistory.toUserId', select: 'name email' }
        ]);
        return res.json(populated);
      } else {
        const pinLookup = Pin.findOne({ id: pinId })
  .select('id projectId')
  .lean();

    const projectLookup = Project.findOne({
      id: projectId || pinId
    })
      .select('id')
      .lean();

    const [pin, requestedProject] = await Promise.all([
      pinLookup,
      projectLookup
    ]);

    if (!pin) {
      return res.status(404).json({ error: 'Pin not found' });
    }

    const project = projectId
      ? requestedProject
      : await Project.findOne({ id: pin.projectId })
          .select('id')
          .lean();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
        issue = new AnnotationIssue({
          id: generateId(), pinId: pin.id, projectId: project.id,
          assigneeId: assigneeId ? new mongoose.Types.ObjectId(assigneeId) : undefined,
          status: status || 'active', labels: labels || [],
          createdBy: new mongoose.Types.ObjectId(userId),
          assignmentHistory: assigneeId ? [{
            fromUserId: new mongoose.Types.ObjectId(userId),
            toUserId: new mongoose.Types.ObjectId(assigneeId),
            status: status || 'active',
            at: new Date()
          }] : []
        });
        await Promise.all([
          issue.save(),
          Pin.findOneAndUpdate(
            { id: pinId },
            { type: 'issue' }
          )
        ]);

        const populated = await issue.populate([
          { path: 'assigneeId', select: 'name email' },
          { path: 'createdBy', select: 'name email' },
          { path: 'assignmentHistory.fromUserId', select: 'name email' },
          { path: 'assignmentHistory.toUserId', select: 'name email' }
        ]);
        res.json(populated);
      }
    } catch (error) {
      console.error('[Create/Update Issue] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Delete issue for pin (convert to comment)
  app.delete('/pins/:pinId/issue', authenticateToken, async (req, res) => {
    try {
      const { pinId } = req.params;
      const issue = await AnnotationIssue.findOne({ pinId });
      if (issue) {
        await AnnotationMessage.deleteMany({ annotationIssueId: issue._id });
        await AnnotationIssue.deleteOne({ _id: issue._id });
      }
      await Pin.findOneAndUpdate({ id: pinId }, { type: 'comment' });
      res.json({ message: 'Issue removed and converted to comment' });
    } catch (error) {
      console.error('[Delete Pin Issue] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/issues/:issueId/status', authenticateToken, async (req, res) => {
    try {
      const { issueId } = req.params;
      const userId = req.user.id;
      const { status } = req.body;
      const issue = await AnnotationIssue.findOne({ id: issueId });
      if (!issue) return res.status(404).json({ error: 'Issue not found' });
      if (!['active', 'in_progress', 'in_review', 'resolved'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      const project = await Project.findOne({ id: issue.projectId })
        .select('id userId assignedUserIds groupId groupIds')
        .lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      let canUpdate = project.userId.toString() === userId;
      if (!canUpdate && issue.assigneeId && issue.assigneeId.toString() === userId) canUpdate = true;
      if (!canUpdate && issue.createdBy && issue.createdBy.toString() === userId) canUpdate = true;
      if (!canUpdate && project.assignedUserIds && project.assignedUserIds.some(id => id.toString() === userId)) canUpdate = true;
      if (!canUpdate) {
        const groups = await findProjectGroupsPopulated(project);
        for (const g of groups) {
          const member = g.members.find(m => m.userId?._id?.toString?.() === userId || m.userId.toString() === userId);
          if (!member) continue;
          const desig = (member.designation || '').toLowerCase();
          if (desig === 'pm' || desig === 'product manager' || desig === 'qa' || desig === 'tester' || desig === 'quality assurance' || member.role === 'owner' || member.role === 'admin') {
            canUpdate = true;
            break;
          }
        }
      }
      if (!canUpdate) return res.status(403).json({ error: 'Access denied' });
      const prevStatus = issue.status;
      if (status !== prevStatus) {
        if (!issue.assignmentHistory) issue.assignmentHistory = [];
        issue.assignmentHistory.push({
          fromUserId: issue.assigneeId ? issue.assigneeId : issue.createdBy,
          toUserId: issue.assigneeId ? issue.assigneeId : issue.createdBy,
          status,
          at: new Date()
        });
      }
      issue.status = status;
      await issue.save();
      const populated = await issue.populate([
        { path: 'assigneeId', select: 'name email' },
        { path: 'createdBy', select: 'name email' },
        { path: 'assignmentHistory.fromUserId', select: 'name email' },
        { path: 'assignmentHistory.toUserId', select: 'name email' }
      ]);
      res.json(populated);
    } catch (error) {
      console.error('[Update Issue Status] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/issues/:issueId/messages', authenticateToken, async (req, res) => {
    try {
      const { issueId } = req.params;
      const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 500);
      const before = req.query.before;
      const userId = req.user.id;

      const issue = await AnnotationIssue.findOne({ id: issueId }).select('_id projectId').lean();
      if (!issue) return res.status(404).json({ error: 'Issue not found' });

      const project = await Project.findOne({ id: issue.projectId })
        .select('id userId assignedUserIds groupId groupIds')
        .lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const hasAccess = await checkProjectAccess(project, userId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

      const userObjId = new mongoose.Types.ObjectId(userId);
      let isTeamMember = false;

      const projectGroupObjectIds = getProjectGroupObjectIds(project);
      if (projectGroupObjectIds.length) {
        const projectGroups = await Group.find({ _id: { $in: projectGroupObjectIds } }).select('type').lean();
        isTeamMember = projectGroups.some(g => g.type === 'team');
      }

      if (!isTeamMember) {
        const teamGroups = await Group.find({
          type: 'team',
          $or: [{ 'members.userId': userObjId }, { createdBy: userObjId }]
        }).select('_id').lean();
        isTeamMember = teamGroups.length > 0;
      }

      const query = { annotationIssueId: issue._id };
      if (!isTeamMember) query.visibility = 'all';

      if (before) {
        const beforeStr = before.toString();
        const beforeMsg = await AnnotationMessage.findOne({ id: beforeStr }).select('createdAt').lean();
        if (beforeMsg && beforeMsg.createdAt) {
          query.createdAt = { $lt: beforeMsg.createdAt };
        } else {
          const parsed = Date.parse(beforeStr);
          if (!isNaN(parsed)) query.createdAt = { $lt: new Date(parsed) };
        }
      }

      const msgs = await AnnotationMessage.find(query)
        .populate('senderId', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      const messages = msgs.reverse();
      res.json(messages);
    } catch (error) {
      console.error('[Get Issue Messages] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/issues/:issueId/messages', authenticateToken, async (req, res) => {
    try {
      const { issueId } = req.params;
      const userId = req.user.id;
      const { content, visibility = 'all' } = req.body;
      if (!content) return res.status(400).json({ error: 'Content required' });
      const issue = await AnnotationIssue.findOne({ id: issueId }).select('_id projectId').lean();
      if (!issue) return res.status(404).json({ error: 'Issue not found' });
      const project = await Project.findOne({ id: issue.projectId })
        .select('id userId assignedUserIds groupId groupIds')
        .lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const hasAccess = await checkProjectAccess(project, userId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
      const msg = new AnnotationMessage({
        id: generateId(),
        annotationIssueId: issue._id,
        senderId: new mongoose.Types.ObjectId(userId),
        content,
        visibility: visibility || 'all'
      });
      await msg.save();
      const populated = await msg.populate('senderId', 'name email');
      res.status(201).json(populated);
    } catch (error) {
      console.error('[Send Issue Message] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ==================== PROJECT UPDATE ROUTE ====================

  app.patch('/projects/:projectId', authenticateToken, async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      const { groupId, mode, name, clientName } = req.body;
      const project = await Project.findOne({ id: projectId });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (project.userId.toString() !== userId) {
        let isPM = false;
        const groups = await findProjectGroupsPopulated(project);
        for (const g of groups) {
          const member = g.members.find(m => m.userId?._id?.toString?.() === userId || m.userId.toString() === userId);
          if (!member) continue;
          const desig = (member.designation || '').toLowerCase();
          if (desig === 'pm' || desig === 'product manager' || member.role === 'owner' || member.role === 'admin') {
            isPM = true;
            break;
          }
        }
        if (!isPM) return res.status(403).json({ error: 'Access denied' });
      }
      if (name) project.name = name;
      if (clientName !== undefined) project.clientName = clientName;
      if (mode !== undefined && ['present', 'working'].includes(mode)) project.mode = mode;
      if (groupId !== undefined) {
        const prevGroupObjectIds = getProjectGroupObjectIds(project);
        if (prevGroupObjectIds.length) {
          await Group.updateMany(
            { _id: { $in: prevGroupObjectIds } },
            { $pull: { projectIds: projectId } }
          );
        }
        if (groupId === null || groupId === 'none' || groupId === '') {
          project.groupId = undefined;
          project.groupIds = [];
        } else {
          const newGroup = await Group.findOne({ id: groupId });
          if (newGroup) {
            project.groupId = newGroup._id;
            project.groupIds = [newGroup._id];
            if (!newGroup.projectIds.includes(projectId)) {
              newGroup.projectIds.push(projectId);
              await newGroup.save();
            }
          }
        }
      }
      await project.save();
      res.json(project);
    } catch (error) {
      console.error('[Update Project] Error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  console.log('[CollabRoutes] All collaboration routes registered successfully.');
};