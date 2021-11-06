import {stripe} from "../stripe_helper.js";
import config from "../config.js";
import unparsed from 'koa-body/unparsed.js'
import {handleMauticPayment, handleMauticSubscriptionEnd} from "../mautic_helper.js";

export const postStripeWebhook = [
  async (ctx) => {
    const sig = ctx.get("stripe-signature");

    let event;
    try {
      event = stripe.webhooks.constructEvent(ctx.request.body[unparsed], sig, config["stripe"]["endpointSecret"]);
    } catch (err) {
      ctx.log("Webhook call failed with error: ${err.message}", err)
      ctx.withError(400, "invalid webhook request")
      return;
    }

    ctx.log(`Received stripe webhook event: ${event.type}`)

    switch (event.type) {
      case 'customer.subscription.deleted':
        const subscription = event.data.object
        await handleMauticSubscriptionEnd(ctx, subscription, await stripe.customers.retrieve(subscription["customer"]))
        break;
      case 'invoice.paid':
        const invoice = event.data.object;
        await handleMauticPayment(ctx, invoice, await stripe.customers.retrieve(invoice["customer"]));
        break;
      default:
        ctx.log(`Unknown webhook event: ${event.type}`)
        ctx.withError(400, "unknown webhook event")
        return;
    }

    ctx.body = {
      okay: true
    }
  }
]