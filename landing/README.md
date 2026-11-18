# Vireo Finance Landing Page

This landing page showcases both Personal Banking and Merchant Dashboard apps with the exact design from the mobile apps.

## Features

- **Exact Design**: Replicates the native mobile app landing pages
- **Official Branding**: Uses the actual Vireo Finance logo and brand assets
- **Dark Theme**: Professional dark design with green accents (#5DD62C)
- **Responsive**: Works on mobile, tablet, and desktop
- **Smooth Animations**: Scroll-based reveals and floating effects
- **Two Landing Pages**: Personal and Merchant with easy switching

## Brand Assets

The landing page uses the official Vireo Finance brand assets:
- **Logo**: Light version (`logo-light.png`) in navigation - aspect ratio 503:145
- **Icon**: Mark version (`icon-mark.png`) in the animated card
- **Favicon**: App icon for browser tabs
- **Apple Touch Icon**: For iOS home screen

All assets are automatically copied from the mobile apps.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Configuration

Update the Vercel deployment URLs in:
- `src/components/PersonalLanding.tsx` - Line 32: `PERSONAL_APP_URL`
- `src/components/MerchantLanding.tsx` - Line 32: `MERCHANT_APP_URL`

## Deployment

### Option 1: Static Hosting (Recommended for Litehost)

1. Build the project:
   ```bash
   npm run build
   ```

2. Upload the `dist/` folder contents to your host

### Option 2: Vercel

```bash
npm install -g vercel
vercel
```

### Option 3: Netlify

Drag and drop the `dist/` folder to [app.netlify.com/drop](https://app.netlify.com/drop)

## Structure

```
landing/
├── src/
│   ├── components/
│   │   ├── PersonalLanding.tsx   # Personal banking landing page
│   │   ├── MerchantLanding.tsx   # Merchant dashboard landing page
│   │   └── Landing.css           # Shared styles (exact design system)
│   ├── App.tsx                   # App switcher
│   ├── main.tsx                  # Entry point
│   └── index.css                 # Global styles
├── public/                       # Static assets
└── dist/                         # Production build output
```

## Design System

- **Background**: #0F0F0F (near-black)
- **Surface**: #202020 (charcoal)
- **Text**: #F8F8F8 (off-white)
- **Accent**: #5DD62C (vivid green)
- **Accent Deep**: #337418 (deep green)

## Hackathon Ready

The landing pages load instantly by default:
- Personal landing page loads first
- Switch to Merchant with the nav button
- Direct links to deployed Vercel apps

Perfect for showcasing your hackathon demo!
