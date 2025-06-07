var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-frkmux/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-frkmux/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// worker.js
var worker_default = {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Status OK", { status: 200 });
    }
    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response("Bad Request: invalid JSON", { status: 200 });
    }
    const message = update.message;
    console.log(message);
    if (!message || !message.text) {
      console.log("No message text provided");
      return new Response("No message text provided", { status: 200 });
    }
    const text = message.text;
    let recipeContent;
    let response;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = text.match(urlRegex);
    if (!links || text.length > 1e3) {
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
    const openaiApiUrl = env.OPENAI_API_URL || "https://api.deepseek.com/chat/completions";
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
ingredients:
  - 1 pound (450g) spaghetti
  - "Pasta Sauce":
    - 3 cloves garlic, minced
notes:
  - You can substitute any pasta shape you prefer
---

1. Bring a large pot of salted water to boil. Add pasta and cook according to package directions.

2. While pasta cooks, heat olive oil in a large skillet over medium heat.

3. Add minced garlic and red pepper flakes to the oil and cook until fragrant, about 1 minute.
\`\`\`

IMPORTANT:Make sure to follow the format strictly. 
Ingredients can be nested and grouped into logical parts to help with readability. When nesting ingredients, make sure to surround the key with double quotes.
Instructions should be below of the yaml section by making sure to close the yaml section with --- after the notes section. 
If there are no recipe found, do not return any markdown content. Provide metric measurements for weight and volume in brackets.
`;
    const prompt = `Start of recipe

${recipeContent}

 End of recipe`;
    console.log(prompt);
    let summary;
    try {
      const openaiResponse = await fetch(openaiApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ]
        })
      });
      if (!openaiResponse.ok) {
        console.log("OpenAI API error: " + JSON.stringify(openaiResponse));
        sendTelegramMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          `OpenAI API error:  \`\`\`${JSON.stringify(openaiResponse)}\`\`\``
        );
        return new Response("Failed to summarize recipe", { status: 200 });
      }
      const data = await openaiResponse.json();
      console.log(data);
      summary = data.choices && data.choices[0] && data.choices[0].message.content;
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
    const markdownContent = `# Recipe Summary

${summary.trim()}
`;
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
    const encoder = new TextEncoder("base64");
    const encodedContent = base64ArrayBuffer(encoder.encode(recipe));
    const title = recipe.match(/title: (.*)/)[1].replace(/ /g, "-");
    const timestamp = Date.now();
    const filePath = `_recipes/${timestamp}-${title}.md`;
    const githubApiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
    const body = JSON.stringify({
      message: "Add new recipe summary - " + title,
      content: encodedContent,
      branch: env.GITHUB_BRANCH || "main"
    });
    try {
      const githubResponse = await fetch(githubApiUrl, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "User-Agent": "recipe-worker",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body
      });
      if (!githubResponse.ok) {
        sendTelegramMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          "GitHub API error: " + githubResponse
        );
        return new Response("Failed to push markdown file to GitHub", {
          status: 200
        });
      }
    } catch (err) {
      console.error(err);
      return new Response("Error pushing file to GitHub", { status: 200 });
    }
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      "Recipe summarized and pushed successfully!"
    );
    return new Response("Recipe summarized and pushed successfully!", {
      status: 200
    });
  }
};
function base64ArrayBuffer(arrayBuffer) {
  var base64 = "";
  var encodings = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var bytes = new Uint8Array(arrayBuffer);
  var byteLength = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength = byteLength - byteRemainder;
  var a, b, c, d;
  var chunk;
  for (var i = 0; i < mainLength; i = i + 3) {
    chunk = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    a = (chunk & 16515072) >> 18;
    b = (chunk & 258048) >> 12;
    c = (chunk & 4032) >> 6;
    d = chunk & 63;
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];
    a = (chunk & 252) >> 2;
    b = (chunk & 3) << 4;
    base64 += encodings[a] + encodings[b] + "==";
  } else if (byteRemainder == 2) {
    chunk = bytes[mainLength] << 8 | bytes[mainLength + 1];
    a = (chunk & 64512) >> 10;
    b = (chunk & 1008) >> 4;
    c = (chunk & 15) << 2;
    base64 += encodings[a] + encodings[b] + encodings[c] + "=";
  }
  return base64;
}
__name(base64ArrayBuffer, "base64ArrayBuffer");
async function getRecipeContent(token, url, chatId) {
  try {
    const recipeResponse = await fetch(url);
    if (!recipeResponse.ok) {
      console.log("Failed to fetch recipe content");
      sendTelegramMessage(
        token,
        chatId,
        "Failed to fetch recipe content: " + recipeResponse
      );
      return [
        "",
        new Response("Failed to fetch recipe content", { status: 200 })
      ];
    }
    class TextAccumulator {
      static {
        __name(this, "TextAccumulator");
      }
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
      static {
        __name(this, "NoopHandler");
      }
      text(textChunk) {
        textChunk.remove();
      }
    }
    const accumulator = new TextAccumulator();
    const noopHandler = new NoopHandler();
    const transformedResponse = new HTMLRewriter().on("img", noopHandler).on("style", noopHandler).on("script", noopHandler).on("div", accumulator).transform(recipeResponse);
    await transformedResponse.arrayBuffer();
    let recipeContent = accumulator.accumulated;
    recipeContent = recipeContent.split(" ").map((x) => x.trim()).filter((x) => x).slice(0, 6e3).join(" ");
    return [recipeContent, null];
  } catch (err) {
    console.log("Error fetching recipe content: " + err);
    sendTelegramMessage(token, chatId, "Error fetching recipe content: " + err);
    return ["", new Response("Error fetching recipe content", { status: 200 })];
  }
}
__name(getRecipeContent, "getRecipeContent");
async function sendTelegramMessage(token, chatId, messageText) {
  console.log("Telegram API Request Details:", {
    url: `https://api.telegram.org/${token}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { chat_id: chatId, text: messageText }
  });
  try {
    const response = await fetch(
      `https://api.telegram.org/${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: messageText })
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
__name(sendTelegramMessage, "sendTelegramMessage");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-frkmux/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-frkmux/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
