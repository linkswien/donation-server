import {postDonateSepa} from "./routes/donate_sepa.js"
import Koa from "koa"
import Router from "@koa/router";
import koaBody from 'koa-body';
import config from "./config.js"
import alphanumeric from "alphanumeric-id";
import {postDonateCard} from "./routes/donate_card.js";
import {postStripeWebhook} from "./routes/stripe_webhook.js";
import {postCreateIntent} from "./routes/create_intent.js";
import {postFinishIntent} from "./routes/finish_intent.js";

console.log(`
      _                   _   _                                                
   __| | ___  _ __   __ _| |_(_) ___  _ __        ___  ___ _ ____   _____ _ __ 
  / _\` |/ _ \\| '_ \\ / _\` | __| |/ _ \\| '_ \\ _____/ __|/ _ \\ '__\\ \\ / / _ \\ '__|
 | (_| | (_) | | | | (_| | |_| | (_) | | | |_____\\__ \\  __/ |   \\ V /  __/ |   
  \\__,_|\\___/|_| |_|\\__,_|\\__|_|\\___/|_| |_|     |___/\\___|_|    \\_/ \\___|_|   

`)

const app = new Koa();

// Body handler
app.use(koaBody({
  includeUnparsed: true
}));

// Global error handling
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.body = {error: "Internal error"}
    console.error("server error", err)
  }
})

// Add helper methods
app.use(async (ctx, next) => {
  ctx.requestId = alphanumeric(6).toUpperCase();
  ctx.log = (message, ...objects) => {
    console.log(` [req/${ctx.requestId}] ${message}`, ...objects);
  }
  ctx.withError = (status, message) => {
    ctx.status = status;
    ctx.body = typeof message === "object" ? message : {error: message};
  }
  await next();
});

// Real ip
app.use(async (ctx, next) => {
  const realIpHeaders = config["server"]["realIpHeaders"] ?? [];

  for (let realIpHeader of realIpHeaders) {
    const realIp = ctx.get(realIpHeader);
    if (realIp != null) {
      ctx.ip = realIp;
      break
    }
  }

  await next();
})

// CORS
if (config["server"]["corsAny"]) {
  app.use(async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', ctx.get("Origin"));
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    ctx.set('Access-Control-Allow-Headers', '*');
    await next();
  })
}

// Router
const appRouter = new Router();
appRouter.get("/", ctx => ctx.body = {info: "This is a donation server using stripe made with <3"})
appRouter.post("/donate/sepa", ...postDonateSepa)
appRouter.post("/donate/card", ...postDonateCard)
appRouter.post("/payment-intent", ...postCreateIntent)
appRouter.post("/payment-intent/finish", ...postFinishIntent)
appRouter.post("/webhook", ...postStripeWebhook)

app.use(appRouter.routes());
app.use(appRouter.allowedMethods());

// HTTP Server
const port = config["server"]["port"];
const httpServer = app.listen(port);
httpServer.addListener("listening", () => {
  console.log(`Ready at port ${port}`);
});
httpServer.addListener("error", err => {
  console.error("Failed to start http server", err)
})