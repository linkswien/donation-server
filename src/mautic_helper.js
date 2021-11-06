import MauticConnector from "node-mautic";
import config from "./config.js";
import {splitStripeName, stripe} from "./stripe_helper.js";
import dayjs from "dayjs";
import {DonationType} from "./routes/donate_shared.js";

const mauticConnector = new MauticConnector({
  apiUrl: config["mautic"]["url"],
  username: config["mautic"]["username"],
  password: config["mautic"]["password"],
  timeoutInSeconds: 5
});

export async function handleMauticSubscriptionEnd(ctx, stripeSubscription, stripeCustomer) {
  const contact = await getContact(stripeCustomer)
  if (contact == null) {
    ctx.log(`No mautic contact found for stripe customer ${stripeCustomer.id}`)
    return;
  }

  const contactFields = contact["fields"]["all"];
  await addNote(contact, `Cancelled a subscription (subscriptionId=${stripeSubscription.id})`)

  const stripeSubscriptionIds = editStringArray(contactFields["stripesubscriptionids"], array => {
    const index = array.indexOf(stripeSubscription.id)
    if (index > -1) {
      array.splice(index, 1);
    }
  })

  await mauticConnector.contacts.editContact("PATCH", {
    stripesubscriptionids: stripeSubscriptionIds
  }, contact["id"])

  ctx.log(`Updated mautic contact (contactId=${contact["id"]})`)
}

export async function handleMauticPayment(ctx, invoice, stripeCustomer) {
  const contact = await getContact(stripeCustomer)
  if (contact == null) {
    ctx.log(`No mautic contact found for stripe customer ${stripeCustomer.id}`)
    return;
  }

  let textParts = [];
  textParts.push(`Received a new invoice of ${invoice["total"] / 10000} euros (invoiceId=${invoice.id})`)

  if (invoice.subscription != null) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription)
    textParts.push(`It was created from a subscription (subscriptionId=${subscription.id})`)
    textParts.push(`The next subscription charge will be after ${formatDate(subscription.current_period_end * 1000)}`)
  }

  await addNote(contact, textParts.join(". "))

  ctx.log(`Updated mautic contact (contactId=${contact["id"]})`)
}

export async function handleMauticDonation(ctx, stripeCustomer, donation) {
  const contact = await getOrCreateContact(stripeCustomer, ctx.ip);
  const contactFields = contact["fields"]["all"];

  ctx.log(`Found mautic contact id=${contact["id"]} name="${contactFields["firstname"]} ${contactFields["lastname"]}"`)

  let updateObject = {
    ipAddress: ctx.ip,
    lastdonation: formatDate(new Date()),
    email: stripeCustomer.email,
    stripecustomerid: stripeCustomer.id
  }

  if (donation.type === DonationType.Monthly) {
    updateObject.stripesubscriptionids = editStringArray(contactFields["stripesubscriptionids"],
        array => array.push(donation.subscription.id))
  }

  await mauticConnector.contacts.editContact("PATCH", updateObject, contact["id"]);

  if (donation.type === DonationType.OneTime) {
    await addNote(contact,
      `Donated ${donation.amount / 100} euros using ${donation.paymentMethod} ` +
      `(chargeId=${donation.charge.id})`)
  } else if (donation.type === DonationType.Monthly) {
    await addNote(contact,
      `Subscribed for ${donation.amount / 100} euros using ${donation.paymentMethod} `
      + `(subscriptionId=${donation.subscription.id})`)
  }

  ctx.log(`Updated mautic contact (contactId=${contact["id"]})`)
}

async function addNote(contact, message) {
  await mauticConnector.notes.createNote({
    lead: contact["id"],
    type: "general",
    text: message
  })
}

async function searchContact(expression) {
  const searchResult = await mauticConnector.contacts.listContacts({
    search: "!is:anonymous " + expression,
    limit: 2
  });
  const contacts = Object.values(searchResult["contacts"]);

  // This intentionally returns null if there are multiple results. We only want unique matches.
  return contacts.length === 1 ? contacts[0] : null;
}

async function getContact(stripeCustomer) {
  return (await searchContact(`stripecustomerid:"${stripeCustomer.id}"`)) ??
    (await searchContact(`email:"${stripeCustomer.email}"`)) ??
    null
}

async function getOrCreateContact(stripeCustomer, ipAddress) {
  const contact = await getContact(stripeCustomer)
  if (contact != null) {
    return contact;
  }

  const createRequest = {
    email: stripeCustomer.email,
    ipAddress,
    stripecustomerid: stripeCustomer.id,
    hasdonated: true
  };

  const customerNames = splitStripeName(stripeCustomer);
  if (customerNames != null) {
    createRequest["firstname"] = customerNames.firstName
    createRequest["lastname"] = customerNames.lastName;
  }

  return (await mauticConnector.contacts.createContact(createRequest))["contact"];
}

function editStringArray(input, editCallback) {
  const elements = input == null || input.trim().length === 0 ? [] : input.split(",");
  editCallback(elements);
  return elements.join(",")
}

function formatDate(date) {
  return dayjs(date).format("DD.MM.YYYY HH:mm:ss Z")
}