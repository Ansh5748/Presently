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

const corsOptions = {
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000'
  ].filter(Boolean), // Remove undefined values
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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

// Mutex for serializing heavy browser operations to prevent OOM
class Mutex {
  constructor() {
    this._locking = Promise.resolve();
  }
  lock() {
    let unlock;
    const newLock = new Promise(resolve => unlock = resolve);
    const previousLock = this._locking;
    this._locking = this._locking.then(() => newLock);
    return previousLock.then(() => unlock);
  }
}
const browserMutex = new Mutex();

let globalBrowser = null;

const getBrowser = async () => {
  if (globalBrowser) {
    try {
      await globalBrowser.version();
      if (globalBrowser.isConnected()) {
        console.log('[Browser] Reusing existing browser instance.');
        return globalBrowser;
      }
    } catch (e) {
      // The browser is there, but not responding.
      console.error('[Browser] Browser is not responsive. Re-launching...');
    }

    // If we are here, the browser is not connected or not responsive.
    try {
      await globalBrowser.close();
    } catch (e) {
      console.error('[Browser] Failed to close unresponsive browser:', e);
    }
    globalBrowser = null;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const launchOptions = {
    headless: true,
    // Dump browser process output to the console. Useful for debugging.
    dumpio: isProd,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1280,800',
      // Other memory-saving flags.
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-notifications',
      '--disable-offer-store-unmasked-wallet-cards',
      '--disable-popup-blocking',
      '--disable-print-preview',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--enable-automation',
      '--password-store=basic',
      '--use-mock-keychain',
      ...(isProd ? ['--single-process'] : []),
    ],
    protocolTimeout: 120000
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH && typeof process.env.PUPPETEER_EXECUTABLE_PATH === 'string' && process.env.PUPPETEER_EXECUTABLE_PATH.length > 0) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    console.log('[Browser] Creating new browser instance...');
    globalBrowser = await puppeteer.launch(launchOptions);
    console.log('[Browser] New browser instance created successfully.');
  } catch (error) {
    console.error('[Browser] Failed to launch browser:', error);
    throw error;
  }
  return globalBrowser;
};

// Compression Helper
const compressBase64 = async (base64String) => {
  if (!base64String || typeof base64String !== 'string' || !base64String.startsWith('data:image')) {
    return base64String;
  }

  // Check size (approximate)
  const sizeInBytes = (base64String.length * 3) / 4;
  const TARGET_SIZE = 500 * 1024;
  const MAX_SIZE = 800 * 1024;

  if (sizeInBytes <= MAX_SIZE) return base64String;

  console.log(`[Compression] Optimizing image (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB)...`);

  // const unlock = await browserMutex.lock();
  let browser;
  let page;
  try {
    browser = await puppeteer.launch({
      headless: true,
      dumpio: false, // Reduce noise
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
      ],
      protocolTimeout: 60000
    });
    // const page = await browser.newPage();
    
    // await page.setContent(`<html><body style="margin:0;padding:0;overflow:hidden;"><img id="img" src="${base64String}" style="display:block;;max-width:100%;" /></body></html>`, { waitUntil: 'load' });
    // const browser = await getBrowser();
    page = await browser.newPage();

    // Generate a unique URL to prevent caching issues between requests
    const uniqueId = generateId();
    const imageUrl = `http://localhost/image-${uniqueId}`;

    // Extract correct MIME type to ensure browser decodes it properly
    const matches = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    const mimeType = matches ? matches[1] : 'image/png';
    const base64Data = matches ? matches[2] : base64String;
  
    // OPTIMIZATION: Use Request Interception to load image.
    // Passing huge base64 strings via page.evaluate() or setContent() crashes low-memory servers.
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url() === imageUrl) {
        request.respond({
          status: 200,
          contentType: mimeType,
          body: Buffer.from(base64Data, 'base64')
        });
      } else {
        request.continue();
      }
    });

    // Load a tiny HTML shell that requests the image
    await page.setContent(`
      <html>
        <body style="margin:0;padding:0;overflow:hidden;">
          <img id="img" src="${imageUrl}" style="display:block;max-width:100%;" />
        </body>
      </html>
    `);
    
    // Wait for the image to actually load. Fail fast (30s) if it's stuck.
    await page.waitForFunction(() => {
      const img = document.querySelector('#img');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 30000 });
 

    const img = await page.$('#img');
    const box = await img.boundingBox();

    if (box) {
      // Set viewport to match image dimensions exactly
      const width = Math.ceil(box.width);
      const height = Math.ceil(box.height);
      await page.setViewport({ width, height });
      
      // Try progressive quality reduction
      let buffer = await page.screenshot({ type: 'webp', quality: 50, fullPage: false });
      
      if (buffer.length > TARGET_SIZE) {
         buffer = await page.screenshot({ type: 'webp', quality: 25, fullPage: false });
      }
      
      if (buffer.length > MAX_SIZE) {
         await page.evaluate(() => { document.body.style.zoom = '0.7'; });
         buffer = await page.screenshot({ type: 'webp', quality: 20, fullPage: false });
      }

      if (buffer.length === 0) {
        throw new Error('Generated empty buffer');
      }
      console.log(`[Compression] Reduced to ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
      return `data:image/webp;base64,${buffer.toString('base64')}`;
    }
  } catch (error) {
    console.error('[Compression] Failed:', error.message);
    // Safety: If original is too big for Mongo (>7MB), return null to prevent DB crash
    if (base64String.length > 7 * 1024 * 1024) {
         console.error(`[Compression] Original image too large for MongoDB fallback (${(base64String.length/1024/1024).toFixed(2)}MB). Returning null.`);
        return null; 
    }
    return base64String;
  } finally {
    // if (browser) await browser.close().catch(() => {});
    if (page) await page.close().catch(() => {});
    // unlock();
    if (browser) await browser.close().catch(() => {});
  }
  return base64String;
};

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
    if (err) {
      console.error('[Auth] Token verification failed:', err.message);
      return res.sendStatus(403);
    }
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

    // Check if user should have local compute enabled by default (admins)
    const isSpecialUser = FREE_EMAILS[email.toLowerCase()] !== undefined;
    
    const user = new User({ 
      name, 
      email: email.toLowerCase(), 
      password: hashedPassword,
      isLocalComputeEnabled: isSpecialUser // Auto-enable for admins
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
      email: user.email,
      isLocalComputeEnabled: user.isLocalComputeEnabled
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

// ==================== USER ROUTES ====================

// Update Permission
app.post('/user/permissions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { isLocalComputeEnabled } = req.body;

    const user = await User.findByIdAndUpdate(
      userId, 
      { isLocalComputeEnabled: !!isLocalComputeEnabled },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return updated user payload for frontend storage
    const userPayload = { 
      id: user._id.toString(), 
      name: user.name, 
      email: user.email,
      isLocalComputeEnabled: user.isLocalComputeEnabled
    };

    res.json({ user: userPayload });

  } catch (error) {
    console.error('[Permissions] Error:', error);
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

    // Compress initialPageUrl if needed
    const compressedImageUrl = await compressBase64(initialPageUrl);

    if (!compressedImageUrl) {
      return res.status(422).json({ error: 'Image too large to process. Please try a smaller page.' });
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
        imageUrl: compressedImageUrl,
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

    // Compress imageUrl if needed
    const compressedImageUrl = await compressBase64(imageUrl);

    if (!compressedImageUrl) {
      return res.status(422).json({ error: 'Image too large to process.' });
    }

    const newPage = {
      id: generateId(),
      name,
      imageUrl: compressedImageUrl,
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

    const page = project.pages.find(p => p.id === pageId);
    if (!page) {
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

    // Compress images if updated
    if (updates.imageUrl) {
      updates.imageUrl = await compressBase64(updates.imageUrl);
      if (!updates.imageUrl) return res.status(422).json({ error: 'Desktop image too large.' });
    }
    if (updates.mobileImageUrl) {
      updates.mobileImageUrl = await compressBase64(updates.mobileImageUrl);
      if (!updates.mobileImageUrl) return res.status(422).json({ error: 'Mobile image too large.' });
    }

    page.set(updates);
    await project.save();

    res.json(page);

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

    // Check if project exists and has more than 1 page
    const project = await Project.findOne({ id: projectId, userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (project.pages.length <= 1) {
      return res.status(400).json({ error: 'Project must have at least one page' });
    }

    // Atomic update to remove page (Prevents VersionError)
    await Project.findOneAndUpdate(
      { id: projectId, userId },
      { $pull: { pages: { id: pageId } } }
    );

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
    const { pageId, x, y, title, description, device } = req.body;
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
      description,
      device: device || 'desktop'
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
  let { url, type = 'desktop', useLocal } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'URL query parameter is required',
    });
  }
  url = url.trim();

  // Fix: Ensure URL has protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  if (useLocal === 'true' || useLocal === true) {
    console.log(`[Screenshot] 💻 User requested Local Compute for ${url}`);
    console.log(`[Screenshot] ℹ️  Currently falling back to server-side processing as client-side capture is not yet implemented.`);
  }

  // Fix: Prevent caching of screenshots to avoid 304s on retries
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // let browser;
  let page;
  let pageClosed = false;

  // Helper to optimize screenshot size
  const ensureSafeSize = async (buffer) => {
    if (!buffer) return buffer;
    const TARGET_SIZE_BYTES = 500 * 1024; // 500KB target
    const HARD_LIMIT_BYTES = 800 * 1024;  // 800KB hard limit

    if (buffer.length <= TARGET_SIZE_BYTES) return buffer;

    console.warn(`[Screenshot] ⚠️ Image size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds target. Compressing...`);
    
    try {
      // Attempt 2: Aggressive Compression (Quality 20)
      let compressed = await page.screenshot({ fullPage: true, type: 'webp', quality: 20 });
      
      if (compressed.length <= TARGET_SIZE_BYTES) return compressed;

      console.warn(`[Screenshot] ⚠️ Still large (${(compressed.length / 1024 / 1024).toFixed(2)}MB). Resizing page...`);
      // // Attempt 3: Max Compression (Quality 10)
      // compressed = await page.screenshot({ fullPage: true, type: 'webp', quality: 10, captureBeyondViewport: true });
      
      // Attempt 3: Scale down the page (Zoom 0.6) + Quality 30
      await page.evaluate(() => {
        document.body.style.zoom = '0.6';
      });
      // Wait for layout to settle
      await new Promise(r => setTimeout(r, 300));

      compressed = await page.screenshot({ fullPage: true, type: 'webp', quality: 30 });
      if (compressed.length <= HARD_LIMIT_BYTES) return compressed;

      // Final Fallback: Viewport Only
      // console.warn(`[Screenshot] ⚠️ Image (${(compressed.length / 1024 / 1024).toFixed(2)}MB) still too large. Falling back to Viewport Only...`);
      // return await page.screenshot({ fullPage: false, type: 'webp', quality: 70 });
      
      // Final Fallback: Crop height to ensure it fits (Safe Mode)
      console.warn(`[Screenshot] ⚠️ Image still too large (${(compressed.length / 1024 / 1024).toFixed(2)}MB). Cropping to safe height...`);
      const viewport = page.viewport();
      return await page.screenshot({ 
          type: 'webp', 
          quality: 10,
          fullPage: false,
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(5000, viewport.height) }
      });
    } catch (e) {
      console.warn('[Screenshot] Compression attempt failed', e);
      return buffer; // Return original if compression fails
    }
  };

  // 🔁 helper: take screenshot attempt
  const attemptScreenshot = async (userAgent, options = {}) => {
    const { scroll = true, fullPage = true } = options;
    const attemptName = scroll ? (fullPage ? 'Full' : 'Viewport') : 'Safe';
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`[Screenshot] ⚙️  Config: ${isProd ? 'Production' : 'Development'} | UA: ${type} | Mode: ${scroll ? 'Full' : 'Safe'}`);

    // const launchOptions = {
    //   headless: true,
    //   protocolTimeout: 240000, 
    //   ignoreHTTPSErrors: true, // Ignore SSL certificate errors
    //   ignoreDefaultArgs: ['--enable-automation'],
    //   args: [
    //     '--no-sandbox',
    //     '--disable-setuid-sandbox',
    //     '--disable-dev-shm-usage', // Always enable for stability on heavy pages
    //     '--disable-gpu',
    //     '--disable-blink-features=AutomationControlled',
    //     '--window-size=1280,800', // Reduced from 1920x1080 to save size
    //     '--disable-web-security',
    //     '--disable-features=IsolateOrigins,site-per-process',
    //     '--disable-site-isolation-trials',
    //     '--no-first-run',
    //     '--no-zygote',
    //     // Stealth additions
    //     '--disable-infobars',
    //     '--exclude-switches=enable-automation',
    //     '--use-fake-ui-for-media-stream',
    //     '--use-fake-device-for-media-stream',
    //     '--enable-features=NetworkService',
    //     ...(isProd ? [
    //       '--disable-accelerated-2d-canvas',
    //       '--disable-gl-drawing-for-tests',
    //       '--disable-canvas-aa',
    //       '--single-process'
    //     ] : [])
    //   ],
    // };

    // // Docker/Render specific: Use system chrome if path is provided
    // if (isProd && process.env.PUPPETEER_EXECUTABLE_PATH) {
    //   launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    //   console.log(`[Screenshot] 🔧 Using custom executable: ${launchOptions.executablePath}`);
    // }
    // 
    // console.log(`[Screenshot] 🚀 Launching browser...`);
    // browser = await puppeteer.launch(launchOptions);

    const browser = await getBrowser();
    page = await browser.newPage();

    page.on('error', err => {
        console.error('[Screenshot] Page error:', err.message);
        pageClosed = true;
    });
    page.on('pageerror', pageErr => {
        console.error('[Screenshot] Uncaught page exception:', pageErr.message);
    });

    // Stealth: Hide webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // Mock languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      // Mock maxTouchPoints
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 });
      // Mock chrome
      window.chrome = { runtime: {} };
      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: 'denied' }) :
          originalQuery(parameters)
      );
    });

    // // 🛡️ Block heavy media to prevent crashes/timeouts
    // await page.setRequestInterception(true);
    // page.on('request', (req) => {
    //   const resourceType = req.resourceType();
    //   if (resourceType === 'media' || resourceType === 'websocket') {
    //     req.abort();
    //   } else {
    //     req.continue();
    //   }
    // });

     // Note: Request Interception removed to prevent "s.startsWith is not a function" errors
+    // and instability with data/blob URLs.

    // 🔒 lifecycle guards
    page.on('close', () => { pageClosed = true; });
    page.on('error', () => { pageClosed = true; });
    // page.on('framedetached', () => { pageClosed = true; }); // REMOVED: Caused false positives on sites with dynamic iframes

    const isMobile = type === 'mobile';
    
    await page.setViewport({ 
      width: isMobile ? 375 : 1280, // Reduced desktop width
      height: isMobile ? 667 : 800,
      isMobile: isMobile,
      hasTouch: isMobile,
      deviceScaleFactor: isMobile ? 2 : 1
    });
    await page.setUserAgent(userAgent);

    // 🚀 navigate
    console.log(`[Screenshot] 🌍 Navigating to ${url}...`);
    try {
      await page.goto(url, {
        waitUntil: 'networkidle0', // More stable than domcontentloaded
        timeout: 90000, // Increased timeout for slow networks/sites
      });
      console.log(`[Screenshot] > Navigation to ${url} successful.`);
    } catch (error) {
      console.error(`[Screenshot] > Navigation to ${url} failed:`, error.message);
      throw error;
    }
    // 📏 Ensure page has content before proceeding
    try {
      await page.waitForFunction(() => document.body && document.body.scrollHeight > 0, { timeout: 5000 });
    } catch (e) {
      console.log(`[Screenshot] ⚠️ Body height check timed out. Waiting for network idle...`);
      // Fallback: wait for network idle if DOM is empty/stuck
      try {
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 });
      } catch (err) {
        // Ignore network idle timeout
      }
    }

    // 🧠 ensure DOM exists
    console.log(`[Screenshot] ⏳ Waiting for DOM content...`);
    await page.waitForFunction(
      () => !!document && !!document.body,
    );
    console.log(`[Screenshot] > DOM content ready.`);

    if (pageClosed || page.isClosed()) {
      throw new Error('PAGE_CLOSED');
    }

    // 🧬 SPA hydration
    // await page.waitForTimeout(2000);

    // 🔄 auto-scroll (lazy load)
    if (scroll) try {
      console.log(`[Screenshot] 📜 Scrolling to trigger lazy content (videos/shoppable looks)...`);
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let totalHeight = 0;
          const distance = 150; // Slightly larger chunks for speed
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight || totalHeight > 25000) { 
              clearInterval(timer);
              resolve();
            }
          }, 50); // Faster interval + small chunks = smooth human-like scroll
        });
      });

      console.log(`[Screenshot] ⏱️  Waiting for network idle after scroll...`);
      // Wait for lazy-loaded resources (videos/images) to actually load
      try {
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });
      } catch (e) {
        console.log(`[Screenshot] ⚠️ Network idle timeout (continuing anyway)...`);
      }
      
      // Wait for final render/animations
      await new Promise(r => setTimeout(r, 2000));
    } catch {
      console.log(`[Screenshot] ⚠️ Scroll error (non-fatal)`);
    }

    // 🖼️ wait for images & videos
    console.log(`[Screenshot] 🖼️  Verifying media loaded...`);
    if (scroll) try {
      await page.evaluate(async () => {
        const images = Array.from(document.images);
        await Promise.all(
          images.map(img =>
            img.complete
              ? Promise.resolve()
              : new Promise(res => {
                  img.onload = img.onerror = res;
                  setTimeout(res, 2000); // Timeout for individual images
                })
          )
        );

        const videos = Array.from(document.querySelectorAll('video'));
        await Promise.all(
          videos.map(v =>
            v.readyState >= 2
              ? Promise.resolve()
              : new Promise(res => {
                  v.onloadeddata = v.onerror = res;
                  setTimeout(res, 2000); // Timeout for videos
                })
          )
        );
      });
    } catch {
      // Ignore media wait errors
    }

    // 📏 Cap height to prevent OOM on infinite scroll pages (e.g. mobile views)
    if (scroll) try {
      await page.evaluate(() => {
        const maxH = 15000; // 15k pixels max height
        if (document.body.scrollHeight > maxH) {
            document.body.style.height = maxH + 'px';
            document.body.style.overflow = 'hidden';
            console.log(`[Screenshot] > Capped page height to ${maxH}px.`);
        }
      });
    } catch (e) {}

    // ⬆️ back to top
    try {
      console.log(`[Screenshot] ⬆️  Resetting view to top...`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 1000)); // Wait for header to reset
    } catch {
      // Ignore
    }

    if (pageClosed || page.isClosed()) {
      throw new Error('PAGE_CLOSED');
    }

    // 📸 screenshot
    // console.log(`[Screenshot] 📸 Capturing final image...`);
    try {
      console.log(`[Screenshot] > Taking screenshot (fullPage: ${fullPage})...`);
      const buffer = await page.screenshot(fullPage ? {
        fullPage: true, 
        type: 'webp', // WebP is faster and smaller
        quality: 70,
        captureBeyondViewport: true,
      } : { fullPage: false, type: 'webp', quality: 70 });

      if (!buffer || buffer.length === 0) {
        throw new Error('Generated empty screenshot buffer');
      }
      console.log(`[Screenshot] > Screenshot successful (${(buffer.length / 1024).toFixed(2)} KB).`);
      return buffer;

    } catch (e) {
      console.log(`[Screenshot] ⚠️ Full page screenshot failed (${e.message}), capturing viewport only...`);
      return await page.screenshot({
        fullPage: false,
        type: 'webp',
        quality: 70,
      });
    }
  };

  const unlock = await browserMutex.lock();
  try {
    console.log(`[Screenshot] Attempting ${type} capture for ${url}`);
    console.log('[take] Running Attempt 1: Standard Mode');

    let ua;
    if (type === 'mobile') {
      ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1';
    } else {
      ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    }

    // // 1️⃣ Attempt 1: Standard (Scroll + FullPage)
    // let screenshot = await attemptScreenshot(ua, { scroll: true, fullPage: true });

    // // 📏 Size Check & Optimization (Target: ~500KB)
    // const TARGET_SIZE_BYTES = 500 * 1024; // 500KB target
    // const HARD_LIMIT_BYTES = 800 * 1024;  // 800KB hard limit

    // if (screenshot.length > TARGET_SIZE_BYTES) {
    //   console.warn(`[Screenshot] ⚠️ Image size ${(screenshot.length / 1024 / 1024).toFixed(2)}MB exceeds target. Compressing...`);
      
    //   // Attempt 2: Aggressive Compression (Quality 20)
    //   try {
    //     screenshot = await page.screenshot({ fullPage: true, type: 'webp', quality: 20, captureBeyondViewport: true });
    //   } catch (e) { console.warn('Compression attempt failed', e); }

    //   if (screenshot.length > TARGET_SIZE_BYTES) {
    //      console.warn(`[Screenshot] ⚠️ Still large (${(screenshot.length / 1024 / 1024).toFixed(2)}MB). Maximizing compression...`);
    //      // Attempt 3: Max Compression (Quality 10) + Resize via viewport (simulated by just taking a lower quality shot)
    //      try {
    //         screenshot = await page.screenshot({ fullPage: true, type: 'webp', quality: 10, captureBeyondViewport: true });
    //      } catch (e) { console.warn('Max compression failed', e); }
    //   }

    //   // Final Fallback: Safe Mode (Viewport Only) if still too big
    //   // This guarantees the image is small enough for MongoDB
    //   if (screenshot.length > HARD_LIMIT_BYTES) {
    //     console.warn(`[Screenshot] ⚠️ Image (${(screenshot.length / 1024 / 1024).toFixed(2)}MB) still too large. Falling back to Viewport Only...`);
    //     if (browser) await browser.close().catch(() => {});
    //     // Re-launch or just re-use if active, but attemptScreenshot handles new page if needed, 
    //     // actually we need to call the helper which expects browser to be open or handles it.
    //     // Since we closed browser above to clear memory, we need to restart logic or just use viewport on current page if open?
    //     // The helper 'attemptScreenshot' launches browser. So we are good.
    //     screenshot = await attemptScreenshot(ua, { scroll: false, fullPage: false });
    //   }
    // }

    let screenshot = await attemptScreenshot(ua, { scroll: true, fullPage: true });
    screenshot = await ensureSafeSize(screenshot);

    if (!screenshot || screenshot.length === 0) {
      throw new Error('Empty screenshot buffer');
    }

    console.log(`[Screenshot] ✅ ${type} screenshot captured successfully for ${url}`);
    res.set('Content-Type', 'image/webp');
    return res.send(screenshot);

  } catch (err) {
    console.warn(`[Screenshot] ${type} failed for ${url}: ${err.message}`);
    console.warn('[Screenshot] 🔄 Retrying with Light Mode (No Scroll, FullPage)...');

    try {
      // if (browser) await browser.close();
      if (page) {
          await page.close().catch(() => {});
          page = null;
        }
      pageClosed = false;

      let ua;
      if (type === 'mobile') {
        ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1';
      } else {
        ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
      }

      // 2️⃣ Attempt 2: Light Mode (No Manual Scroll + FullPage) - Prevents OOM on heavy sites
      // const screenshot = await attemptScreenshot(ua, { scroll: false, fullPage: true });
      let screenshot = await attemptScreenshot(ua, { scroll: false, fullPage: true });
      screenshot = await ensureSafeSize(screenshot);

      console.log(`[Screenshot] ✅ Light Mode successful for ${url}`);
      res.set('Content-Type', 'image/webp');
      return res.send(screenshot);

    } catch (retryErr) {
      console.error(`[Screenshot] Light Mode failed for ${url}: ${retryErr.message}`);
      console.warn('[Screenshot] ⚠️ All full-page attempts failed. Trying Safe Mode (Viewport only)...');

      try {
        // if (browser) await browser.close();
        if (page) await page.close().catch(() => {});
        pageClosed = false;                                                                                                                                                                              
        
        // 🛡️ Safe Mode: Desktop UA, No Scroll, Viewport Only
        let ua;
        if (type === 'mobile') {
          ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1';
        } else {
          ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
        }

        // 3️⃣ Attempt 3: Safe Mode (Viewport Only)
        // const safeScreenshot = await attemptScreenshot(ua, { scroll: false, fullPage: false });
        let safeScreenshot = await attemptScreenshot(ua, { scroll: false, fullPage: false });
        safeScreenshot = await ensureSafeSize(safeScreenshot);

        console.log(`[Screenshot] ✅ Safe Mode screenshot captured for ${url}`);
        res.set('Content-Type', 'image/webp');
        return res.send(safeScreenshot);
      } catch (safeErr) {
        console.error(`[Screenshot] Safe Mode failed for ${url}: ${safeErr.message}`);
        let reason = 'UNKNOWN_FAILURE';
        if (safeErr.message.includes('Navigating frame was detached') || safeErr.message.includes('Target closed')) {
          reason = 'BROWSER_CRASH';
        } else if (safeErr.message.includes('timed out')) {
          reason = 'TIMEOUT';
        } else if (safeErr.message.includes('net::')) {
          reason = 'NAVIGATION_ERROR';
        }
        return res.status(422).json({
          success: false,
          reason: reason,
          message: 'Unable to capture screenshot. Site may be blocking automated access.',
          url,
        });
      }
    }
  } finally {
    // if (browser) {
    //   await browser.close().catch(() => {});
    // }
    if (page) await page.close().catch(() => {});
    unlock();
  }
});

app.get('/', (req, res) => {
  res.send('👋 Hi, Presently Backend running successfully...');
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
  console.log(`✅ Screenshot service is running at http://localhost:${PORT}`);
  console.log(`✅ MongoDB URI: ${process.env.MONGODB_URI ? 'Configured' : 'Missing'}`);
  console.log(`✅ Payment Method: ${process.env.USE_RAZORPAY === 'true' ? 'Razorpay' : 'Custom'}`);
});
