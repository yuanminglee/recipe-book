# Recipe Book Jekyll Site

A Jekyll-powered recipe collection with Tailwind CSS styling.

## Development Setup

### Prerequisites

- Ruby 3.3+
- Node.js 18+
- Yarn package manager

### Local Development

1. **Install dependencies:**

   ```bash
   bundle install
   yarn install
   ```

2. **Development workflow:**

   ```bash
   # Start Jekyll development server
   bundle exec jekyll serve --livereload

   # In another terminal, watch CSS changes (optional)
   yarn dev-css
   ```

### CSS Development

This project uses Tailwind CSS. The source CSS file is `assets/css/main-source.css` which contains:

- Tailwind directives (`@tailwind base`, etc.)
- Custom CSS styles

**Important:** GitHub Pages doesn't support PostCSS processing, so we pre-build the CSS.

#### CSS Build Process

1. **For development:** Edit `assets/css/main-source.css`
2. **Build CSS:** Run `yarn build-css` to generate the processed `assets/css/main.css`
3. **Commit both files** - GitHub Pages uses the processed `main.css`

#### Available Scripts

```bash
# Build CSS for production (minified)
yarn build-css

# Watch CSS during development
yarn dev-css

# Full production build
yarn build
```

## Deployment

### GitHub Pages (Automatic)

The site automatically deploys to GitHub Pages when you push to the `main` branch using GitHub Actions. The workflow:

1. Installs Ruby 3.3 and Node.js 18
2. Installs dependencies (both Ruby gems and Node packages)
3. Builds the site with Jekyll
4. Deploys to GitHub Pages

### Manual Deployment

1. **Build CSS:** `yarn build-css`
2. **Build site:** `JEKYLL_ENV=production bundle exec jekyll build`
3. **Deploy:** Upload `_site/` contents to your hosting provider

## Project Structure

```
├── _layouts/           # Jekyll layouts
├── _recipes/          # Recipe markdown files
├── assets/css/        # CSS files
│   ├── main.css       # Processed CSS (for GitHub Pages)
│   └── main-source.css # Source CSS with Tailwind directives
├── _config.yml        # Jekyll configuration
├── Gemfile           # Ruby dependencies
├── package.json      # Node.js dependencies
└── tailwind.config.js # Tailwind configuration
```

## Adding Recipes

1. Create a new markdown file in `_recipes/`
2. Use the front matter format from existing recipes
3. The recipe will automatically appear in the sidebar

## Troubleshooting

### Styling Issues on GitHub Pages

- Ensure `yarn build-css` was run before committing
- Check that `assets/css/main.css` contains processed CSS (not `@tailwind` directives)
- Verify the GitHub Actions deployment succeeded

### Local Development Issues

- Use Ruby 3.3: `chruby ruby-3.3.1` (if using chruby)
- Clear Jekyll cache: `bundle exec jekyll clean`
- Rebuild CSS: `yarn build-css`
