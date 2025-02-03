### Step-by-Step Plan

---

#### **1. Set Up Jekyll Static Site**
- **Step 1.1**: Install Jekyll (`gem install bundler jekyll`).  
- **Step 1.2**: Create a new Jekyll site (`jekyll new recipe-site`).  
- **Step 1.3**: Modify the Jekyll layout:  
  - Add a **sidebar** (`_includes/sidebar.html`) to list recipe names (loop through `site.recipes`).  
  - Add a **content section** (`_layouts/recipe.html`) to display detailed recipes.  
- **Step 1.4**: Store recipes in `_recipes/` as markdown files with front matter (e.g., `title`, `date`).  
- **Step 1.5**: Push the Jekyll site to a GitHub repository (e.g., `username/recipe-site`).

---

#### **2. Set Up GitHub Repository**
- **Step 2.1**: Create a new GitHub repo for the Jekyll site.  
- **Step 2.2**: Generate a **personal access token** (repo scope) for GitHub API access.  
- **Step 2.3**: Add a GitHub Actions workflow to auto-build and deploy the Jekyll site (e.g., to GitHub Pages).

---

#### **3. Set Up Cloudflare Worker**
- **Step 3.1**: Create a Cloudflare Worker (`workers.dev`).  
- **Step 3.2**: Write the worker script to:  
  1. Listen for Telegram bot updates (via webhook).  
  2. Extract recipe links from messages.  
  3. Fetch the recipe content from the link.  
  4. Send the content to an OpenAI-compatible API for summarization (e.g., `POST /v1/completions`).  
  5. Format the response as markdown.  
  6. Push the markdown file to the GitHub repo using the GitHub API (`PUT /repos/{owner}/{repo}/contents/{path}`).  
- **Step 3.3**: Deploy the worker and set up a Telegram bot webhook to point to the worker URL.

---

#### **4. Configure Telegram Bot**
- **Step 4.1**: Create a bot using [BotFather](https://core.telegram.org/bots#botfather).  
- **Step 4.2**: Set the bot's webhook to the Cloudflare Worker URL.  
- **Step 4.3**: Test the bot by sharing recipe links in the chat.

---

#### **5. Automate Jekyll Site Updates**
- **Step 5.1**: When the worker pushes a new markdown file to GitHub, the Jekyll site will auto-rebuild (via GitHub Actions).  
- **Step 5.2**: The updated site will display the new recipe in the sidebar and content section.

---

### Tools & APIs Used:
- **Jekyll**: Static site generator.  
- **GitHub API**: Push markdown files.  
- **Cloudflare Worker**: Serverless function for bot logic.  
- **OpenAI-compatible API**: Summarize recipes.  
- **Telegram Bot API**: Handle chat interactions.  

This setup minimizes compute resources by using serverless functions and static site generation.