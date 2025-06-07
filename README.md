# Recipe Collection System 🍳

An automated recipe collection system that combines a beautiful Jekyll static site with a Telegram bot for effortless recipe management.

## Features

- 📱 **Telegram Bot Integration**: Share recipe links or paste text directly in Telegram
- 🤖 **AI-Powered Processing**: Automatically summarizes and formats recipes using AI
- 🌐 **Beautiful Web Interface**: Clean, responsive Jekyll site to browse your recipes
- ⚡ **Serverless Architecture**: Powered by Cloudflare Workers and GitHub Pages
- 🔄 **Automatic Updates**: New recipes automatically appear on your website

## Quick Start

1. **Clone this repository**
2. **Follow the [comprehensive deployment guide](DEPLOYMENT.md)**
3. **Start collecting recipes through your Telegram bot!**

## How It Works

1. Share a recipe URL or paste recipe text in your Telegram bot
2. The Cloudflare Worker processes the content using AI
3. A formatted recipe markdown file is automatically added to your GitHub repository
4. GitHub Actions rebuilds and deploys your updated recipe website

## Live Demo

Check out the existing recipes in the `_recipes/` folder to see the format and quality of processed recipes.

## Deployment Options

- ✅ **GitHub Pages** (recommended)
- ✅ **Cloudflare Pages**
- ✅ **Netlify**
- ✅ **Vercel**

## Tech Stack

- **Frontend**: Jekyll, Tailwind CSS
- **Backend**: Cloudflare Workers
- **AI**: OpenAI/Groq/DeepSeek compatible APIs
- **Storage**: GitHub repository
- **Deployment**: GitHub Actions, various static hosts

## Getting Started

For detailed setup instructions covering all platforms and configuration options, see the **[DEPLOYMENT.md](DEPLOYMENT.md)** file.

## Configuration

All sensitive configuration is handled through environment variables:
- `OPENAI_API_KEY` - Your AI service API key
- `GITHUB_TOKEN` - GitHub personal access token
- `TELEGRAM_BOT_TOKEN` - Telegram bot token

See the deployment guide for complete setup instructions.

## Contributing

Feel free to open issues or submit pull requests to improve the system!

## License

MIT License - feel free to use this for your own recipe collection!