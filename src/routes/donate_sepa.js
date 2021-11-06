import {stripe} from "../stripe_helper.js";
import {
  addSubscriptionForSource, donateValidator, DonationType,
  getOrCreateCustomer,
  getOrCreateSource
} from "./donate_shared.js";

export const postDonateSepa = [
  donateValidator,

  async (ctx) => {
    const {email, sourceId, amount} = ctx.request.body;
    const customer = await getOrCreateCustomer(ctx, email);

    // Get and check source
    let inputSource = await stripe.sources.retrieve(sourceId);
    if (inputSource.currency !== "eur") {
      return ctx.withError(400, "Donations are only allowed in EUR");
    }
    if (inputSource.type !== "sepa_debit") {
      return ctx.withError(400, "This route only allows for SEPA donations");
    }

    // Check for existing source on the customer
    const source = await getOrCreateSource(ctx, customer, inputSource);

    // Create final subscription
    await addSubscriptionForSource(ctx, amount, customer, source);

    ctx.body = {
      okay: true,
      mandateUrl: source.sepa_debit.mandate_url
    }
  }
]

