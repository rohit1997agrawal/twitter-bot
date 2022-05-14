const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const databaseReference = admin.firestore().doc("oath/tokens");

const TwitterApi = require("twitter-api-v2").default;

const clientTwitter = new TwitterApi({
  clientId: "<CLIENT_ID>",
  clientSecret: "<CLIENT_SECRET>",
});
const callbackUrl =
  "http://127.0.0.1:5000/twitterbotrohit1997/us-central1/callback";

// OpenAI API init
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  organization: "<ORG_ID>",
  apiKey: "<API_KEY>",
});
const openai = new OpenAIApi(configuration);

//First step
exports.auth = functions.https.onRequest(async (request, response) => {
  const { url, codeVerifier, state } = clientTwitter.generateOAuth2AuthLink(
    callbackUrl,
    { scope: ["tweet.read", "tweet.write", "users.read", "offline.access"] }
  );

  // store verifier
  await databaseReference.set({ codeVerifier, state });

  response.redirect(url);
});

//Second step
exports.callback = functions.https.onRequest(async (request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = await databaseReference.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send("Stored tokens do not match!");
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await clientTwitter.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackUrl,
  });

  await databaseReference.set({ accessToken, refreshToken });

  const { data } = await loggedClient.v2.me(); // start using the client if you want

  response.sendStatus(data);
});

//Third step
exports.tweet = functions.https.onRequest(async (request, response) => {
  const { refreshToken } = (await databaseReference.get()).data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await clientTwitter.refreshOAuth2Token(refreshToken);

  await databaseReference.set({ accessToken, refreshToken: newRefreshToken });

  const nextTweet = await openai.createCompletion("text-davinci-001", {
    prompt: "Say something cool about tech",
    max_tokens: 64,
  });

  const { data } = await refreshedClient.v2.tweet(
    nextTweet.data.choices[0].text
  );

  response.send(data);
});
