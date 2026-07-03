import Page from '../models/page.js';

// --- Admin Endpoints ---

// @desc    Get all pages
// @route   GET /api/v1/pages/admin
// @access  Private/Admin
export const getAdminPages = async (req, res) => {
  try {
    const pages = await Page.find({}).sort({ updatedAt: -1 });
    res.status(200).json({ success: true, result: pages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single page by ID
// @route   GET /api/v1/pages/admin/:id
// @access  Private/Admin
export const getAdminPageById = async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    res.status(200).json({ success: true, result: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a page
// @route   POST /api/v1/pages/admin
// @access  Private/Admin
export const createPage = async (req, res) => {
  try {
    const { slug, title, content, isPublished } = req.body;
    
    // Check if slug already exists
    const existingPage = await Page.findOne({ slug });
    if (existingPage) {
      return res.status(400).json({ success: false, message: 'A page with this slug already exists.' });
    }

    const page = await Page.create({
      slug,
      title,
      content,
      isPublished
    });
    
    res.status(201).json({ success: true, result: page, message: 'Page created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a page
// @route   PUT /api/v1/pages/admin/:id
// @access  Private/Admin
export const updatePage = async (req, res) => {
  try {
    const { slug, title, content, isPublished } = req.body;
    const page = await Page.findById(req.params.id);

    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }

    // Check slug conflict if slug is changed
    if (slug && slug !== page.slug) {
      const existingPage = await Page.findOne({ slug });
      if (existingPage) {
        return res.status(400).json({ success: false, message: 'A page with this slug already exists.' });
      }
      page.slug = slug;
    }

    if (title) page.title = title;
    if (content !== undefined) page.content = content;
    if (isPublished !== undefined) page.isPublished = isPublished;

    await page.save();
    res.status(200).json({ success: true, result: page, message: 'Page updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a page
// @route   DELETE /api/v1/pages/admin/:id
// @access  Private/Admin
export const deletePage = async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    await page.deleteOne();
    res.status(200).json({ success: true, message: 'Page deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Public Endpoints ---

// @desc    Get published page by slug
// @route   GET /api/v1/pages/public/:slug
// @access  Public
export const getPublishedPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const page = await Page.findOne({ slug, isPublished: true });
    
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found or not published' });
    }
    
    res.status(200).json({ success: true, result: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
