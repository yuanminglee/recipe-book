/* worker.js: Cloudflare Worker Script for Recipe Summarization and Push to GitHub */

export default {
  async fetch(request, env, ctx) {
    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response("Status OK", { status: 200 });
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response("Bad Request: invalid JSON", { status: 200 });
    }

    // Check for Telegram message update
    const message = update.message;
    console.log(message);
    if (!message || !message.text) {
      console.log("No message text provided");
      return new Response("No message text provided", { status: 200 });
    }

    // Handle group chat privacy mode - bot needs to be mentioned or message should be a command
    const isGroupChat =
      message.chat.type === "group" || message.chat.type === "supergroup";
    let text = message.text;

    if (isGroupChat) {
      const botUsername = env.BOT_USERNAME; // Add this to your environment variables
      const isMentioned =
        botUsername &&
        (text.includes(`@${botUsername}`) ||
          (message.entities &&
            message.entities.some(
              (entity) =>
                entity.type === "mention" &&
                text.substring(entity.offset, entity.offset + entity.length) ===
                  `@${botUsername}`
            )));
      const isCommand = text.startsWith("/");
      const isReplyToBot =
        message.reply_to_message &&
        message.reply_to_message.from &&
        message.reply_to_message.from.is_bot;

      // Check if message contains a recipe URL or seems like recipe content
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const hasUrl = urlRegex.test(text);
      const seemsLikeRecipe =
        text.length > 50 &&
        (text.toLowerCase().includes("recipe") ||
          text.toLowerCase().includes("ingredients") ||
          text.toLowerCase().includes("cooking") ||
          text.toLowerCase().includes("cook") ||
          text.toLowerCase().includes("minutes") ||
          text.toLowerCase().includes("cups") ||
          text.toLowerCase().includes("tablespoon") ||
          text.toLowerCase().includes("teaspoon"));

      // In groups, process if: mentioned, command, reply to bot, has URL, or seems like recipe content
      if (
        !isMentioned &&
        !isCommand &&
        !isReplyToBot &&
        !hasUrl &&
        !seemsLikeRecipe
      ) {
        console.log(
          "Message in group doesn't appear to be recipe-related - ignoring"
        );
        return new Response("Message ignored - not recipe-related", {
          status: 200,
        });
      }

      // Remove bot mention from text for processing
      if (isMentioned && botUsername) {
        text = text.replace(new RegExp(`@${botUsername}`, "g"), "").trim();
      }
    }

    // Send immediate acknowledgment for better user experience
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      "🍳 Processing your recipe... This may take a moment!"
    );

    let recipeContent;
    let response;
    // Extract the first URL from the message text
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = text.match(urlRegex);
    if (!links || text.length > 1000) {
      console.log("No links found in message, using text as recipe content");
      recipeContent = text;
    } else {
      const recipeUrl = links[0];
      [recipeContent, response] = await getRecipeContent(
        env.TELEGRAM_BOT_TOKEN,
        recipeUrl,
        message.chat.id
      );
      if (response) {
        return response;
      }
    }

    // Prepare prompt and call OpenAI-compatible API to summarize the recipe
    const openaiApiUrl =
      env.OPENAI_API_URL || "https://api.deepseek.com/chat/completions";
    const model = env.OPENAI_MODEL || "deepseek-chat";
    const systemPrompt = `You are an expert in cooking and food. You are given a text output of a recipe webpage and you need to convert it into a markdown file in english that is easy to understand and follow in the following format strictly:

\`\`\`markdown
---
layout: recipe
title: Delicious Pasta
description: A quick and easy pasta dish perfect for weeknight dinners
servings: 4
prep_time: 15 minutes
cook_time: 20 minutes
total_time: 35 minutes
ingredients:
  - 1 pound (450g) spaghetti
  - "Pasta Sauce":
    - 3 cloves garlic, minced
    - 2 tablespoons (30ml) olive oil
notes:
  - You can substitute any pasta shape you prefer
---

**Quick Navigation:**
- [Shopping List](#shopping-list)
- [Prep Timeline](#prep-timeline) 
- [Ingredients](#ingredients)
- [Instructions](#instructions)

## Shopping List

### Produce
- [ ] 3 cloves garlic

### Pantry
- [ ] 1 pound (450g) spaghetti
- [ ] 2 tablespoons (30ml) olive oil

### Spices & Herbs
- [ ] Red pepper flakes

## Prep Timeline

### 30 minutes before cooking
- [ ] Fill large pot with salted water and start heating
- [ ] Mince garlic cloves

### 15 minutes before cooking
- [ ] Bring water to a rolling boil
- [ ] Heat olive oil in large skillet

### Start cooking
- [ ] Add pasta to boiling water
- [ ] Begin cooking garlic in oil

## Ingredients
- 1 pound (450g) spaghetti
- 3 cloves garlic, minced
- 2 tablespoons (30ml) olive oil
- Red pepper flakes to taste

## Instructions

1. Bring a large pot of salted water to boil. Add pasta and cook according to package directions.

2. While pasta cooks, heat olive oil in a large skillet over medium heat.

3. Add minced garlic and red pepper flakes to the oil and cook until fragrant, about 1 minute.
\`\`\`

IMPORTANT: Follow the format strictly with these requirements:
1. Include navigation links at the top with anchor links to sections
2. Generate a shopping list organized by supermarket sections: Produce, Dairy, Meat & Seafood, Pantry, Frozen, Bakery, Spices & Herbs, Beverages, Other
3. Create a prep timeline with checkboxes showing when to do each task
4. Include total_time in the YAML frontmatter 
5. Use checkboxes (- [ ]) for shopping list and prep timeline items
6. Ingredients can be nested and grouped into logical parts using double quotes for keys
7. Instructions should be numbered steps below the YAML section
8. Always close the YAML section with --- 
9. Provide metric measurements for weight and volume in brackets
10. If no recipe is found, do not return any markdown content
11. Organize prep timeline by time before cooking starts (e.g., "30 minutes before", "15 minutes before", "Start cooking")
12. Include parallel tasks that can be done simultaneously in the prep timeline
`;
    const prompt = `Start of recipe\n\n${recipeContent}\n\n End of recipe`;
    console.log(prompt);

    let summary;
    try {
      const openaiResponse = await fetch(openaiApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        const errorDetails = {
          status: openaiResponse.status,
          statusText: openaiResponse.statusText,
          body: errorText,
        };
        console.log("OpenAI API error:", errorDetails);
        sendTelegramMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          `OpenAI API error: ${openaiResponse.status} ${openaiResponse.statusText}\n\`\`\`${errorText}\`\`\``
        );
        return new Response("Failed to summarize recipe", { status: 200 });
      }
      const data = await openaiResponse.json();
      console.log(data);
      summary =
        data.choices && data.choices[0] && data.choices[0].message.content;
    } catch (err) {
      sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        "Error calling summarization API: " + err
      );
      return new Response("Error calling summarization API", { status: 200 });
    }

    if (!summary) {
      return new Response("No summary produced", { status: 200 });
    }

    // Format the markdown content with the summary and original link
    const markdownContent = `# Recipe Summary\n\n${summary.trim()}\n`;
    const match = markdownContent.match("```markdown\n((\n|.)*)```");
    if (!match) {
      sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `No recipe found`
      );
      return new Response("No markdown content found", { status: 200 });
    }
    const recipe = match[1];
    console.log(recipe);

    // Extract title safely with fallback
    let title = "recipe";
    const titleMatch = recipe.match(/title:\s*(.+)/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1]
        .trim()
        .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .toLowerCase()
        .substring(0, 50); // Limit length
    }

    // Encode the markdown content in Base64
    const encoder = new TextEncoder();
    const encodedContent = base64ArrayBuffer(encoder.encode(recipe));

    // Define the file path for the new markdown file
    const timestamp = Date.now();
    const filePath = `_recipes/${timestamp}-${title}.md`;

    console.log(`Creating file: ${filePath}`);

    // Validate environment variables
    if (!env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      const missingVars = [];
      if (!env.GITHUB_OWNER) missingVars.push("GITHUB_OWNER");
      if (!env.GITHUB_REPO) missingVars.push("GITHUB_REPO");
      if (!env.GITHUB_TOKEN) missingVars.push("GITHUB_TOKEN");

      const errorMsg = `Missing environment variables: ${missingVars.join(
        ", "
      )}`;
      console.log(errorMsg);
      sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, errorMsg);
      return new Response("GitHub configuration error", { status: 200 });
    }

    // Prepare GitHub API URL for creating/updating a file
    const githubApiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
    const requestBody = {
      message: `Add new recipe summary - ${title}`,
      content: encodedContent,
      branch: env.GITHUB_BRANCH || "main",
    };

    console.log(`GitHub API URL: ${githubApiUrl}`);
    console.log(`Request body: ${JSON.stringify(requestBody, null, 2)}`);

    try {
      const githubResponse = await fetch(githubApiUrl, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "User-Agent": "recipe-worker",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(requestBody),
      });
      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        const errorMsg = `GitHub API error: ${githubResponse.status} ${githubResponse.statusText}\n\nDetails: ${errorText}`;
        console.log(errorMsg);
        sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, errorMsg);
        return new Response("Failed to push markdown file to GitHub", {
          status: 200,
        });
      }
    } catch (err) {
      const errorMsg = `Error pushing file to GitHub: ${
        err.message || err.toString()
      }`;
      console.error(errorMsg);
      sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `${errorMsg}\n\nPlease check your GitHub configuration:\n- Repository exists\n- Token has write permissions\n- Branch name is correct`
      );
      return new Response("Error pushing file to GitHub", { status: 200 });
    }

    // Send update message to Telegram chat using helper function
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      "Recipe summarized and pushed successfully!"
    );

    return new Response("Recipe summarized and pushed successfully!", {
      status: 200,
    });
  },
};

function base64ArrayBuffer(arrayBuffer) {
  var base64 = "";
  var encodings =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  var bytes = new Uint8Array(arrayBuffer);
  var byteLength = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength = byteLength - byteRemainder;

  var a, b, c, d;
  var chunk;

  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048) >> 12; // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032) >> 6; // 4032     = (2^6 - 1) << 6
    d = chunk & 63; // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];

    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

    // Set the 4 least significant bits to zero
    b = (chunk & 3) << 4; // 3   = 2^2 - 1

    base64 += encodings[a] + encodings[b] + "==";
  } else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008) >> 4; // 1008  = (2^6 - 1) << 4

    // Set the 2 least significant bits to zero
    c = (chunk & 15) << 2; // 15    = 2^4 - 1

    base64 += encodings[a] + encodings[b] + encodings[c] + "=";
  }

  return base64;
}

async function getRecipeContent(token, url, chatId) {
  // Fetch the recipe content from the URL and extract only plain text using HTMLRewriter
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const recipeResponse = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    clearTimeout(timeoutId);
    if (!recipeResponse.ok) {
      const errorMsg = `Failed to fetch recipe content. Status: ${recipeResponse.status} ${recipeResponse.statusText}`;
      console.log(errorMsg);
      sendTelegramMessage(
        token,
        chatId,
        `Failed to fetch recipe content: ${recipeResponse.status} ${recipeResponse.statusText}\n\nURL: ${url}`
      );
      return [
        "",
        new Response("Failed to fetch recipe content", { status: 200 }),
      ];
    }

    // Define a handler to accumulate text from the HTML
    class TextAccumulator {
      constructor() {
        this.accumulated = "";
      }
      text(textChunk) {
        if (!textChunk.removed) {
          this.accumulated += textChunk.text;
        }
      }
    }

    class NoopHandler {
      text(textChunk) {
        textChunk.remove();
      }
    }

    const accumulator = new TextAccumulator();
    const noopHandler = new NoopHandler();
    // Use HTMLRewriter to parse the HTML and accumulate text from the body
    const transformedResponse = new HTMLRewriter()
      .on("img", noopHandler)
      .on("style", noopHandler)
      .on("script", noopHandler)
      .on("div", accumulator)
      .transform(recipeResponse);

    // Drain the stream to ensure all text is processed
    await transformedResponse.arrayBuffer();

    let recipeContent = accumulator.accumulated;
    // replace image contents with empty string
    recipeContent = recipeContent
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x)
      .slice(0, 3000) // Reduced from 6000 to 3000 words to stay under token limit
      .join(" ");
    return [recipeContent, null];
  } catch (err) {
    let errorMessage = "Error fetching recipe content: ";

    if (err.name === "AbortError") {
      errorMessage += "Request timed out (30s limit exceeded)";
    } else if (err.message.includes("fetch")) {
      errorMessage += "Network error - Unable to connect to website";
    } else {
      errorMessage += err.message || err.toString();
    }

    console.log(errorMessage);
    sendTelegramMessage(
      token,
      chatId,
      `${errorMessage}\n\nURL: ${url}\n\nTip: Try copying the recipe text directly instead of sending the URL.`
    );
    return ["", new Response("Error fetching recipe content", { status: 200 })];
  }
}

// Helper function to send a message to Telegram chat
async function sendTelegramMessage(token, chatId, messageText) {
  try {
    const response = await fetch(
      `https://api.telegram.org/${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: messageText }),
      }
    );
    if (!response.ok) {
      console.error(
        "Failed to send Telegram update message:",
        await response.text()
      );
    }
  } catch (err) {
    console.error("Error sending Telegram update message:", err);
  }
}
