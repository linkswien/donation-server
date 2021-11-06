import {Stripe} from "stripe";
import config from "./config.js";

const allCachedPrices = {};
export const stripe = new Stripe(config["stripe"]["secretKey"], {apiVersion: "2020-08-27"});

export async function getPricesByProduct(productId) {
  let cachedPrices = allCachedPrices[productId];
  if (cachedPrices != null) {
    return cachedPrices;
  }

  const listCall = stripe.prices.list({product: productId});
  cachedPrices = await autoPagingToArray(listCall);
  allCachedPrices[productId] = cachedPrices;
  return cachedPrices;
}

// This is required because the default autoPagingToArray method has a limit
async function autoPagingToArray(list) {
  const resultArray = [];
  await list.autoPagingEach(async (elem) => {
    resultArray.push(elem)
  });
  return resultArray;
}

export function splitStripeName(stripeCustomer) {
  if (stripeCustomer.name == null) return null;

  const split = stripeCustomer.name.split(" ");
  if (split.length !== 2) return null;

  return {firstName: split[0], lastName: split[1]};
}

getPricesByProduct(config["stripe"]["monthlyProductId"])
  .catch(err => console.log("Failed to preload prices for monthly subscription product", err))