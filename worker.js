/* worker.js: Cloudflare Worker Script for Recipe Summarization and Push to GitHub */

export default {
  async fetch(request, env, ctx) {
    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Status OK', { status: 200 });
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response('Bad Request: invalid JSON', { status: 400 });
    }

    // Check for Telegram message update
    const message = update.message;
    console.log(message);
    if (!message || !message.text) {
        console.log("No message text provided");
      return new Response('No message text provided', { status: 200 });
    }

    const text = message.text;
    // Extract the first URL from the message text
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = text.match(urlRegex);
    if (!links) {
        console.log("No links found in message");
      return new Response('No links found in message', { status: 200 });
    }
    const recipeUrl = links[0];

    // Fetch the recipe content from the URL and extract only plain text using HTMLRewriter
    let recipeContent;
    try {
      const recipeResponse = await fetch(recipeUrl);
      if (!recipeResponse.ok) {
        console.log("Failed to fetch recipe content");
        sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Failed to fetch recipe content: ' + recipeResponse);
        return new Response('Failed to fetch recipe content', { status: 200 });
      }
      
      // Define a handler to accumulate text from the HTML
      class TextAccumulator {
        constructor() { this.accumulated = ''; }
        text(textChunk) {
          this.accumulated += textChunk.text;
        }
      }
      
      const accumulator = new TextAccumulator();
      
      // Use HTMLRewriter to parse the HTML and accumulate text from the body
      const transformedResponse = new HTMLRewriter()
        .on('div', accumulator)
        .transform(recipeResponse);
      
      // Drain the stream to ensure all text is processed
      await transformedResponse.arrayBuffer();
      
      recipeContent = accumulator.accumulated;
      // replace image contents with empty string
      recipeContent = recipeContent.replace(/<img[^>]*>/g, '');
      recipeContent = recipeContent.split(" ").filter(x => {
        return x.trim()
      }).slice(0, 6000).join(" ");
    } catch (err) {
      sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Error fetching recipe content: ' + err);
      return new Response('Error fetching recipe content', { status: 200 });
    }

    // Prepare prompt and call OpenAI-compatible API to summarize the recipe
    const openaiApiUrl = env.OPENAI_API_URL || 'https://api.deepseek.com/chat/completions';
    const model = env.OPENAI_MODEL || 'deepseek-chat';
    const systemPrompt = `You are an expert in cooking and food. You are given a text output of a recipe webpage and you need to convert it into a markdown file that is easy to understand and follow in the following format strictly:
\`\`\`markdown
---
layout: recipe
title: Delicious Pasta  Delicious Pasta  Delicious Pasta  Delicious Pasta
description: A quick and easy pasta dish perfect for weeknight dinners
servings: 4
prep_time: 15 minutes
cook_time: 20 minutes
ingredients:
  - 1 pound spaghetti
  - "Pasta Sauce":
    - 3 cloves garlic, minced
notes:
  - You can substitute any pasta shape you prefer
---

1. Bring a large pot of salted water to boil. Add pasta and cook according to package directions.

2. While pasta cooks, heat olive oil in a large skillet over medium heat.

3. Add minced garlic and red pepper flakes to the oil and cook until fragrant, about 1 minute.
\`\`\`

Make sure to follow the format strictly. Ingredients can be nested. Instructions should be below of the yaml section by making sure to add --- after the notes content.
`;
    const prompt = `Summarize the following recipe:\n\n${recipeContent}`;
    console.log(prompt);

    let summary;
    try {
      const openaiResponse = await fetch(openaiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (!openaiResponse.ok) {
        sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'OpenAI API error: ' + openaiResponse);
        return new Response('Failed to summarize recipe', { status: 500 });
      }
      const data = await openaiResponse.json();
      console.log(data);
      summary = data.choices && data.choices[0] && data.choices[0].message.content;
    } catch (err) {
      sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Error calling summarization API: ' + err);
      return new Response('Error calling summarization API', { status: 500 });
    }

    if (!summary) {
      return new Response('No summary produced', { status: 500 });
    }

    // Format the markdown content with the summary and original link
    const markdownContent = `# Recipe Summary\n\n${summary.trim()}\n\n[Original Recipe](${recipeUrl})\n`;
    const recipe = markdownContent.match("```markdown\n((\n|.)*)```")[1]

    // Encode the markdown content in Base64 use TextEncoder
    const encoder = new TextEncoder('base64');
    const encodedContent = base64ArrayBuffer(encoder.encode(recipe));
    const title = recipe.match(/title: (.*)/)[1].replace(/ /g, '-');

    // Define the file path for the new markdown file
    const timestamp = Date.now();
    const filePath = `_recipes/${title}-${timestamp}.md`;

    // Prepare GitHub API URL for creating/updating a file
    const githubApiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
    const body = JSON.stringify({
        message: 'Add new recipe summary - ' + title,
        content: encodedContent,
        branch: env.GITHUB_BRANCH || 'main'
    });
    try {
      const githubResponse = await fetch(githubApiUrl, {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'User-Agent': 'recipe-worker',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: body
      });
      if (!githubResponse.ok) {
        sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'GitHub API error: ' + githubResponse);
        return new Response('Failed to push markdown file to GitHub', { status: 500 });
      }
    } catch (err) {
      console.error(err);
      return new Response('Error pushing file to GitHub', { status: 500 });
    }

    // Send update message to Telegram chat using helper function
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Recipe summarized and pushed successfully!');

    return new Response('Recipe summarized and pushed successfully!', { status: 200 });
  }
}; 

function base64ArrayBuffer(arrayBuffer) {
    var base64    = ''
    var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  
    var bytes         = new Uint8Array(arrayBuffer)
    var byteLength    = bytes.byteLength
    var byteRemainder = byteLength % 3
    var mainLength    = byteLength - byteRemainder
  
    var a, b, c, d
    var chunk
  
    // Main loop deals with bytes in chunks of 3
    for (var i = 0; i < mainLength; i = i + 3) {
      // Combine the three bytes into a single integer
      chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
  
      // Use bitmasks to extract 6-bit segments from the triplet
      a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
      b = (chunk & 258048)   >> 12 // 258048   = (2^6 - 1) << 12
      c = (chunk & 4032)     >>  6 // 4032     = (2^6 - 1) << 6
      d = chunk & 63               // 63       = 2^6 - 1
  
      // Convert the raw binary segments to the appropriate ASCII encoding
      base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
    }
  
    // Deal with the remaining bytes and padding
    if (byteRemainder == 1) {
      chunk = bytes[mainLength]
  
      a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2
  
      // Set the 4 least significant bits to zero
      b = (chunk & 3)   << 4 // 3   = 2^2 - 1
  
      base64 += encodings[a] + encodings[b] + '=='
    } else if (byteRemainder == 2) {
      chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]
  
      a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
      b = (chunk & 1008)  >>  4 // 1008  = (2^6 - 1) << 4
  
      // Set the 2 least significant bits to zero
      c = (chunk & 15)    <<  2 // 15    = 2^4 - 1
  
      base64 += encodings[a] + encodings[b] + encodings[c] + '='
    }
    
    return base64
  }

// Helper function to send a message to Telegram chat
async function sendTelegramMessage(token, chatId, messageText) {
  try {
    const response = await fetch(`https://api.telegram.org/${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: messageText })
    });
    if (!response.ok) {
      console.error('Failed to send Telegram update message:', await response.text());
    }
  } catch (err) {
    console.error('Error sending Telegram update message:', err);
  }
}