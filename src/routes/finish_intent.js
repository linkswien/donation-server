import {stripe} from "../stripe_helper.js";
import {getJoiMiddleware} from "../shared.js";
import Joi from "joi";
import {handleMauticDonation} from "../mautic_helper.js";
import {DonationType} from "./donate_shared.js";

export const postFinishIntent = [
  getJoiMiddleware(Joi.object({
    intentId: Joi.string().required(),
  })),

  async (ctx) => {
    const {intentId} = ctx.request.body;
    const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
    if (paymentIntent == null) {
      return ctx.withError(404, "Unable to retrieve payment intent");
    }
    if (paymentIntent.status !== "succeeded" && paymentIntent.status !== "processing") {
      return ctx.withError(400, "Invalid payment intent status")
    }

    const charge = paymentIntent.charges.data[0]
    if (charge == null) {
      return ctx.withError(404, "Unable to retrieve charge from payment intent")
    }

    const customer = typeof paymentIntent.customer === "object" ? paymentIntent.customer
      : (await stripe.customers.retrieve(paymentIntent.customer));
    if (customer == null) {
      return ctx.withError(404, "Unable to retrieve customer");
    }

    const paymentMethod = typeof paymentIntent.payment_method === "object" ? paymentIntent.payment_method
      : (await stripe.paymentMethods.retrieve(paymentIntent.payment_method));
    if (paymentMethod == null) {
      return ctx.withError(404, "Unable to retrieve payment method");
    }

    ctx.log(`Finishing payment intent ${paymentIntent.id}, amount: ${paymentIntent.amount}`)

    await handleMauticDonation(ctx, customer, {
      type: DonationType.OneTime,
      amount: paymentIntent.amount,
      paymentMethod: paymentMethod.type,
      charge
    })

    ctx.body = {
      okay: true
    }
  }
]