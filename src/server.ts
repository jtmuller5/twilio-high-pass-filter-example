import express from "express";
import http from "http";
import { twiml } from "twilio";
import dotenv from "dotenv";
import ngrok from "ngrok";
import { twilioWss } from "./twilioSocket";
import path from "path";

dotenv.config();

const app = express();
app.use(express.static(path.join(__dirname, "../public")));

app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);

// Start the server
const PORT = parseInt(process.env.PORT || "3000", 10);

export const callCache: Record<string, any> = {};

server.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  // Set up ngrok
  try {
    const url = await ngrok.connect({
      addr: PORT,
      subdomain: process.env.NGROK_SUBDOMAIN,
    });
    console.log(`ngrok URL: ${url}`);
  } catch (error) {
    console.error("Error setting up ngrok:", error);
  }
});

// Update server upgrade handler
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url!, `http://${request.headers.host}`)
    .pathname;

  console.log(`Upgrade request received for path: ${pathname}`);

  console.log("Handling Twilio WebSocket upgrade");

  twilioWss.handleUpgrade(request, socket, head, (ws) => {
    twilioWss.emit("connection", ws, request);
  });
});

app.post("/voice", async (req, res) => {
  console.log("Received voice call:", JSON.stringify(req.body));

  const { From } = req.body as CallRequest;

  const twimlResponse = new twiml.VoiceResponse();

  const connect = twimlResponse.connect();
  const stream = connect.stream({
    url: `wss://${req.headers.host}/stream`,
  });

  stream.parameter({
    name: "From",
    value: From,
  });

  res.type("text/xml");
  res.send(twimlResponse.toString());
});

export interface CallRequest {
  Called: string;
  ToState: string;
  CallerCountry: string;
  Direction: string;
  CallerState: string;
  ToZip: string;
  CallSid: string;
  To: string;
  CallerZip: string;
  ToCountry: string;
  StirVerstat: string;
  CallToken: string;
  CalledZip: string;
  ApiVersion: string;
  CalledCity: string;
  CallStatus: string;
  From: string;
  AccountSid: string;
  CalledCountry: string;
  CallerCity: string;
  ToCity: string;
  FromCountry: string;
  Caller: string;
  FromCity: string;
  CalledState: string;
  FromZip: string;
  FromState: string;
}
