export const SEARCH_SELECTORS = {
  // Search result cards — Etsy uses data attributes and specific class patterns
  cardContainer:
    '[data-search-results] .v2-listing-card, [data-search-results] .wt-grid__item-xs-6',

  // Each individual listing card
  listingCard: '.v2-listing-card, [data-listing-id]',

  // Listing link (contains the URL and listing ID)
  listingLink: 'a.listing-link, a[data-listing-id]',

  // Listing image
  listingImage: '.v2-listing-card__img img, .wt-width-full',

  // Title text
  title: '.v2-listing-card__title, .wt-text-caption',

  // Price
  price: '.currency-value, .lc-price .wt-text-title-01',

  // Shop name
  shopName: '.v2-listing-card__shop, .wt-text-caption .shop-name-display',

  // Rating
  rating: '.v2-listing-card__rating, [class*="star"]',

  // Review count
  reviewCount: '.v2-listing-card__rating-count',

  // Bestseller badge
  bestseller: '[class*="bestseller"], .wt-badge--sale',

  // Popular now badge
  popularNow: '[class*="popular"], .wt-badge--popular',

  // Ad indicator
  adIndicator: '[class*="ad"], [data-appears-component-name*="ad"]',

  // Discount / sale price
  salePrice: '.lc-price .wt-text-strikethrough',
  originalPrice: '.lc-price .wt-text-strikethrough',

  // Search result count
  resultCount: '.wt-text-body-01',

  // Pagination
  nextPage: 'a.wt-action--primary[data-page]',
  paginationLinks: '.wt-action-group__item-center a',

  // Block detection
  blockedPage: '#captcha-container, .wt-alert--error-01, [class*="captcha"]',
} as const;

export const LISTING_SELECTORS = {
  // JSON-LD script tag
  jsonLd: 'script[type="application/ld+json"]',

  // Page state / embedded data
  pageStateScript: 'script[data-static-url], script[id*="data"]',
  webpackData: 'script[data-static-url]',

  // Title
  title: 'h1.wt-text-body-03, h1[data-buy-box-listing-title], h1.wt-break-word',

  // Price
  priceValue: '.wt-text-title-03 .currency-value, [data-buy-box-region] .currency-value',
  priceContainer:
    '[data-buy-box-region] .wt-display-flex-xs-nowrap, .buy-box price, [data-product-price]',
  originalPrice: '.wt-text-title-01--inverse .wt-text-strikethrough',
  discountBadge: '[class*="sale"], [class*="discount"], .wt-badge--sale',

  // Shop
  shopName:
    '.wt-text-link-no-underline.wt-text-caption, [data-shop-name], a[href*="/shop/"] .wt-text-caption',
  shopLink: 'a[href*="/shop/"]',
  shopSalesCount: '.wt-text-body-01',
  shopRating: '[class*="shop-rating"]',

  // Reviews — listing specific
  listingRating: '.wt-badge--status-with-icon, [data-rating]',
  listingReviewCount: '.wt-text-body-01',

  // Reviews section header (e.g. "Reviews for this item")
  reviewsForItemHeader: '.wt-text-link-no-underline:has-text("Reviews for this item")',

  // Description
  description: '.wt-text-truncate--multi-line, [data-buy-box-region] .wt-text-body-01',

  // Full description
  fullDescription: '#wt-content-toggle-product-details-read-more, .wt-text-body-01',

  // Badges
  bestsellerBadge: '.wt-badge--bestseller, [class*="bestseller"]',
  etsyPickBadge: '.wt-badge--etsy-pick, [class*="etsy-pick"], [class*="etsysChoice"]',
  popularBadge: '.wt-badge--popular, [class*="popular-now"]',

  // Engagement
  cartsCount: '.wt-text-body-01', // "X people have this in their carts"
  favoritesCount: '.wt-text-body-01',

  // Images
  mainImage: '.image-carousel-container img, [data-selector="listing-page-image"] img',
  imageGallery: '.image-carousel-container img, .listing-page-image-carousel img',
  imageCount: '.image-carousel-pagination',

  // Video
  videoElement: 'video source, video',
  videoButton: '[class*="video-button"], [data-video-url]',

  // Related searches
  relatedSearches: '.related-searches a, [class*="related-search"] a',

  // Tags
  tags: '.wt-text-caption a[href*="tags"], [class*="tag"] a',

  // Breadcrumbs
  breadcrumbs: 'nav.wt-action-group a, [class*="breadcrumb"] a',

  // Digital item info
  digitalBadge: '[class*="digital"], .wt-badge--digital',

  // Blocked
  blockedPage: '#captcha-container, .wt-alert--error-01, [class*="captcha"]',
} as const;

export const BLOCKED_INDICATORS = [
  'captcha',
  'verify you are human',
  'access denied',
  'please verify',
  'robot',
  'blocked',
  'too many requests',
  'rate limit',
  '403 Forbidden',
];
