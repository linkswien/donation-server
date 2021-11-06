import {stripe} from "../stripe_helper.js";
import {getJoiMiddleware} from "../shared.js";
import Joi from "joi";
import {getOrCreateCustomer} from "./donate_shared.js";

export const postCreateIntent = [
  getJoiMiddleware(Joi.object({
    email: Joi.string().email().required(),
    amount: Joi.number().min(1).max(1000).precision(2).required(),
  })),

  async (ctx) => {
    const {amount, email} = ctx.request.body;
    const customer = await getOrCreateCustomer(ctx, email);

    ctx.log(`Creating payment intent (Email: ${email}, Amount (EUR): ${amount})`)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "eur",
      payment_method_types: ["card", "sepa_debit"],
      customer: customer.id,
    });

    ctx.log(`Created payment intent ${paymentIntent.id}`)

    ctx.body = {
      secret: paymentIntent.client_secret
    }
  }
]