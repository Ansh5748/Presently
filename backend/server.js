require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Razorpay = require('razorpay');

// Models
const User = require('./models/User');
const Project = require('./models/Project');
const Pin = require('./models/Pin');
const Subscription = require('./models/Subscription');

// Services
const emailService = require('./services/emailService');

const app = express();
const cors = require('cors');

app.use(cors({
  origin: [
    process.env.FRONTEND_URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// IMPORTANT: handle preflight
app.options('*', cors());

const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.error('Please check your MongoDB URI and network connection');
});

// Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// JWT Secrets
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

// Helper functions
const generateId = () => Math.random().toString(36).substr(2, 9);

// Special free email addresses
const FREE_EMAILS = {
  'divyanshgupta5748@gmail.com': 'skip', // Skip payment entirely
  'divyanshgupta4949@gmail.com': 'auto_approve' // Show payment but auto-approve
};

// ==================== AUTHENTICATION MIDDLEWARE ====================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// ==================== AUTH ROUTES ====================

// Signup
app.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({ 
      name, 
      email: email.toLowerCase(), 
      password: hashedPassword 
    });
    await user.save();

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(email, name).catch(err => 
      console.error('[Signup] Failed to send welcome email:', err.message)
    );

    res.status(201).json({ message: 'User created successfully' });

  } catch (error) {
    console.error('[Signup] Error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userPayload = { 
      id: user._id.toString(), 
      name: user.name, 
      email: user.email 
    };
    
    const accessToken = jwt.sign(userPayload, ACCESS_TOKEN_SECRET, { expiresIn: '3h' });
    const refreshToken = jwt.sign(userPayload, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

    user.refreshTokens.push(refreshToken);
    await user.save();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log('[Auth] User logged in:', user.email);
    res.json({ accessToken, user: userPayload });

  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Refresh Token
app.post('/auth/token', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.sendStatus(401);

    const user = await User.findOne({ refreshTokens: refreshToken });
    if (!user) return res.sendStatus(403);

    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, decoded) => {
      if (err) return res.sendStatus(403);

      const newAccessToken = jwt.sign(
        { id: user._id.toString(), name: user.name, email: user.email },
        ACCESS_TOKEN_SECRET,
        { expiresIn: '3h' }
      );
      res.json({ accessToken: newAccessToken });
    });
  } catch (error) {
    console.error('[Token] Error:', error);
    res.sendStatus(500);
  }
});

// Logout
app.post('/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (refreshToken) {
      await User.updateOne(
        { refreshTokens: refreshToken },
        { $pull: { refreshTokens: refreshToken } }
      );
    }
    res.clearCookie('refreshToken');
    res.sendStatus(204);
  } catch (error) {
    console.error('[Logout] Error:', error);
    res.sendStatus(500);
  }
});

// Forgot Password
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email
    try {
      await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);
      console.log('[ForgotPassword] Reset email sent to:', user.email);
    } catch (emailError) {
      console.error('[ForgotPassword] Email send failed:', emailError);
      // Clear the reset token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
    }

    res.json({ message: 'If an account exists with this email, a password reset link has been sent' });

  } catch (error) {
    console.error('[ForgotPassword] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset Password
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = []; // Logout all sessions
    await user.save();

    console.log('[ResetPassword] Password reset successful for:', user.email);
    res.json({ message: 'Password reset successful. Please login with your new password.' });

  } catch (error) {
    console.error('[ResetPassword] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SUBSCRIPTION ROUTES ====================

// Check subscription status
app.get('/subscription/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Check if user has special free access
    if (FREE_EMAILS[userEmail] === 'skip') {
      return res.json({ 
        hasActiveSubscription: true, 
        isSpecialAccount: true, 
        type: 'unlimited_free' 
      });
    }

    // Find active subscription
    const activeSubscription = await Subscription.findOne({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).sort({ expiresAt: -1 });

    if (activeSubscription) {
      return res.json({ 
        hasActiveSubscription: true,
        subscription: activeSubscription
      });
    }

    res.json({ hasActiveSubscription: false });

  } catch (error) {
    console.error('[Subscription Status] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pricing with coupon
app.post('/subscription/calculate-price', authenticateToken, async (req, res) => {
  try {
    const { plan, currency, couponCode } = req.body;

    const prices = {
      USD: { '1_month': 10, '6_month': 55, '12_month': 110 },
      INR: { '1_month': 900, '6_month': 4300, '12_month': 9800 }
    };

    let amount = prices[currency][plan];
    let discount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      if (couponCode === 'FREEDG100' && plan === '1_month') {
        discount = 100;
        appliedCoupon = 'FREEDG100';
      } else if (couponCode === 'OFFERDG50') {
        discount = 50;
        appliedCoupon = 'OFFERDG50';
      }
    }

    const finalAmount = Math.round(amount * (1 - discount / 100));

    res.json({ 
      originalAmount: amount,
      discount,
      finalAmount,
      appliedCoupon,
      currency
    });

  } catch (error) {
    console.error('[Calculate Price] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Razorpay order
app.post('/subscription/create-order', authenticateToken, async (req, res) => {
  try {
    const { plan, currency, amount, couponCode } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Check if auto-approve email
    if (FREE_EMAILS[userEmail] === 'auto_approve') {
      // Create auto-approved subscription
      const duration = plan === '1_month' ? 30 : plan === '6_month' ? 180 : 365;
      const subscription = new Subscription({
        userId,
        email: userEmail,
        plan,
        currency,
        amount: 0,
        status: 'active',
        paymentMethod: 'auto_approved',
        startDate: new Date(),
        expiresAt: new Date(Date.now() + duration * 24 * 60 * 60 * 1000),
        isAutoApproved: true
      });
      await subscription.save();

      return res.json({ 
        autoApproved: true, 
        subscription,
        message: 'Subscription activated automatically for your account' 
      });
    }

    // Create Razorpay order for regular users
    if (process.env.USE_RAZORPAY === 'true') {
      const options = {
        amount: amount * 100, // Razorpay expects amount in paise
        currency,
        receipt: `sub_${Date.now()}`
      };

      const order = await razorpay.orders.create(options);

      // Create pending subscription
      const subscription = new Subscription({
        userId,
        email: userEmail,
        plan,
        currency,
        amount,
        status: 'pending',
        paymentMethod: 'razorpay',
        orderId: order.id
      });
      await subscription.save();

      res.json({ 
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID
      });
    } else {
      // Custom payment method (manual)
      res.json({ 
        customPayment: true,
        upiId: process.env.UPI_ID,
        paypalUsername: process.env.PAYPAL_USERNAME,
        amount,
        currency
      });
    }

  } catch (error) {
    console.error('[Create Order] Error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify Razorpay payment
app.post('/subscription/verify-payment', authenticateToken, async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    const userId = req.user.id;

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(orderId + '|' + paymentId);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Update subscription
    const subscription = await Subscription.findOne({ userId, orderId, status: 'pending' });
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const duration = subscription.plan === '1_month' ? 30 : subscription.plan === '6_month' ? 180 : 365;
    
    subscription.status = 'active';
    subscription.paymentId = paymentId;
    subscription.startDate = new Date();
    subscription.expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    await subscription.save();

    console.log('[Payment] Subscription activated for user:', userId);
    res.json({ success: true, subscription });

  } catch (error) {
    console.error('[Verify Payment] Error:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// ==================== PROJECT ROUTES ====================

// Get all projects for user
app.get('/projects', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const projects = await Project.find({ userId }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error('[Get Projects] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single project
app.get('/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { view } = req.query; // 'draft' or 'live'

    const project = await Project.findOne({ id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // If requesting live/published view, return snapshot
    if (view === 'live' && project.status === 'PUBLISHED' && project.publishedSnapshot) {
      return res.json({
        ...project.toObject(),
        pages: project.publishedSnapshot.pages,
        isPublishedView: true
      });
    }

    // Otherwise return draft/current state
    res.json(project);

  } catch (error) {
    console.error('[Get Project] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create project
app.post('/projects', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { name, clientName, websiteUrl, initialPageUrl } = req.body;

    // Check subscription (skip for special emails)
    if (FREE_EMAILS[userEmail] !== 'skip') {
      const activeSubscription = await Subscription.findOne({
        userId,
        status: 'active',
        expiresAt: { $gt: new Date() }
      });

      if (!activeSubscription) {
        return res.status(403).json({ 
          error: 'Active subscription required', 
          requiresSubscription: true 
        });
      }
    }

    const projectId = generateId();
    const project = new Project({
      id: projectId,
      userId,
      name,
      clientName,
      websiteUrl,
      pages: [{
        id: generateId(),
        name: 'Main Page',
        imageUrl: initialPageUrl,
        originalUrl: websiteUrl
      }],
      status: 'DRAFT'
    });

    await project.save();
    console.log('[Project] Created:', projectId);
    res.status(201).json(project);

  } catch (error) {
    console.error('[Create Project] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add page to project
app.post('/projects/:projectId/pages', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, imageUrl, originalUrl } = req.body;
    const userId = req.user.id;

    const project = await Project.findOne({ id: projectId, userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const newPage = {
      id: generateId(),
      name,
      imageUrl,
      originalUrl
    };

    project.pages.push(newPage);
    await project.save();

    res.json(newPage);

  } catch (error) {
    console.error('[Add Page] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update page
app.patch('/projects/:projectId/pages/:pageId', authenticateToken, async (req, res) => {
  try {
    const { projectId, pageId } = req.params;
    const updates = req.body;
    const userId = req.user.id;

    const project = await Project.findOne({ id: projectId, userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const pageIndex = project.pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) {
      return res.status(404).json({ error: 'Page not found' });
    }

    if (updates.deleteAllPins) {
      await Pin.deleteMany({ projectId, pageId });
      delete updates.deleteAllPins; // Don't save this to the page object

      // Reindex remaining pins for that project
      const projectPins = await Pin.find({ projectId }).sort({ number: 1 });
      for (let i = 0; i < projectPins.length; i++) {
        projectPins[i].number = i + 1;
        await projectPins[i].save();
      }
    }

    project.pages[pageIndex] = { ...project.pages[pageIndex].toObject(), ...updates };
    await project.save();

    res.json(project.pages[pageIndex]);

  } catch (error) {
    console.error('[Update Page] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete page
app.delete('/projects/:projectId/pages/:pageId', authenticateToken, async (req, res) => {
  try {
    const { projectId, pageId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({ id: projectId, userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.pages.length <= 1) {
      return res.status(400).json({ error: 'Project must have at least one page' });
    }

    project.pages = project.pages.filter(p => p.id !== pageId);
    await project.save();

    // Delete associated pins
    await Pin.deleteMany({ projectId, pageId });

    // Reindex remaining pins for that project
    const projectPins = await Pin.find({ projectId }).sort({ number: 1 });
    for (let i = 0; i < projectPins.length; i++) {
      projectPins[i].number = i + 1;
      await projectPins[i].save();
    }

    res.json({ message: 'Page deleted' });

  } catch (error) {
    console.error('[Delete Page] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Publish project
app.post('/projects/:projectId/publish', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({ id: projectId, userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Fetch current pins to snapshot
    const pins = await Pin.find({ projectId });
    // Create frozen snapshot
    project.publishedSnapshot = {
      pages: project.pages.map(page => ({ ...page.toObject() })),
      pins: pins.map(pin => ({ ...pin.toObject() })),
      publishedAt: new Date()
    };
    project.status = 'PUBLISHED';
    project.markModified('publishedSnapshot');
    await project.save();

    console.log('[Project] Published:', projectId);
    res.json({ message: 'Project published', project });

  } catch (error) {
    console.error('[Publish Project] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete project
app.delete('/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOneAndDelete({ id: projectId, userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete associated pins
    await Pin.deleteMany({ projectId });

    console.log('[Project] Deleted:', projectId);
    res.json({ message: 'Project deleted' });

  } catch (error) {
    console.error('[Delete Project] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== PIN ROUTES ====================

// Get pins for project
app.get('/projects/:projectId/pins', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { view } = req.query;

    if (view === 'live') {
      const project = await Project.findOne({ id: projectId });
      if (project && project.status === 'PUBLISHED' && project.publishedSnapshot && project.publishedSnapshot.pins) {
        return res.json(project.publishedSnapshot.pins);
      }
      return res.json([]);
    }

    const pins = await Pin.find({ projectId }).sort({ number: 1 });
    res.json(pins);
  } catch (error) {
    console.error('[Get Pins] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create pin
app.post('/projects/:projectId/pins', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { pageId, x, y, title, description } = req.body;
    const userId = req.user.id;

    // Verify project ownership
    const project = await Project.findOne({ id: projectId, userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Calculate next number
    const projectPins = await Pin.find({ projectId });
    const nextNumber = projectPins.length + 1;

    const pin = new Pin({
      id: generateId(),
      projectId,
      pageId,
      x,
      y,
      number: nextNumber,
      title,
      description
    });

    await pin.save();
    res.status(201).json(pin);

  } catch (error) {
    console.error('[Create Pin] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update pin
app.patch('/pins/:pinId', authenticateToken, async (req, res) => {
  try {
    const { pinId } = req.params;
    const updates = req.body;

    const pin = await Pin.findOneAndUpdate(
      { id: pinId },
      updates,
      { new: true }
    );

    if (!pin) {
      return res.status(404).json({ error: 'Pin not found' });
    }

    res.json(pin);

  } catch (error) {
    console.error('[Update Pin] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete pin
app.delete('/pins/:pinId', authenticateToken, async (req, res) => {
  try {
    const { pinId } = req.params;

    const pin = await Pin.findOneAndDelete({ id: pinId });
    if (!pin) {
      return res.status(404).json({ error: 'Pin not found' });
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

// ==================== SCREENSHOT SERVICE ====================

app.get('/take', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Error: URL query parameter is required.');
  }

  // const isProd = process.env.NODE_ENV === 'production';
  let browser;
  try {
    console.log(`[Screenshot] Launching browser for URL: ${url}`);
    
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();

    const launchOptions = {
      headless: "new",
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
      ],
    };

    console.log(`[Screenshot] Using executablePath: ${executablePath}`);

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');

    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    // await new Promise(resolve => setTimeout(resolve, 3000));

    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: 'jpeg',
      quality: 50
    });

    console.log('[Screenshot] Screenshot taken successfully');
    res.set('Content-Type', 'image/jpeg');
    res.send(screenshotBuffer);

  } catch (error) {
    console.error('[Screenshot] Error:', error);
    res.status(500).send(`Failed to take screenshot. Error: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
  console.log(`✅ Screenshot service is running at http://localhost:${PORT}`);
  console.log(`✅ MongoDB URI: ${process.env.MONGODB_URI ? 'Configured' : 'Missing'}`);
  console.log(`✅ Payment Method: ${process.env.USE_RAZORPAY === 'true' ? 'Razorpay' : 'Custom'}`);
});
