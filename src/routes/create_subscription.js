import { stripe } from "../stripe_helper.js";
import { getJoiMiddleware } from "../shared.js";
import Joi from "joi";
import { getOrCreateCustomer, getSubscriptionPrice } from "./donate_shared.js";

export const postCreateSubscription = [
  getJoiMiddleware(Joi.object({
    name: Joi.string().required().trim().min(3),
    email: Joi.string().trim().required().email(),
    amount: Joi.number().min(1).max(1000).precision(2).required(),
  })),

  async (ctx) => {
    const { amount, email, name } = ctx.request.body;
    const customer = await getOrCreateCustomer(ctx, email, name);

    ctx.log(`Creating subscription (Email: ${email}, Amount (EUR): ${amount})`)

    const price = await getSubscriptionPrice(ctx, amount);
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        { price: price.id }
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
    });
    ctx.log(`Created a monthly subscription ${subscription.id}`)

    const invoice = await stripe.invoices.retrieve(subscription.latest_invoice);
    const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);

    ctx.log(`Payment intent to be paid to activate subscription: ${paymentIntent.id}`)

    ctx.body = {
      subscriptionId: subscription.id,
      secret: paymentIntent.client_secret,
    }
  }
]
