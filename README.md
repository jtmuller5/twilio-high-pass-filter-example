# Steps

## Create a Twilio Account

Create a Twilio account and purchase a new number.

## Run the Server

Use the VS Code "Run Server" task or the following command to run the server:

```bash
npm run dev
```

This will print out an ngrok URL. Copy that.

## Paste the Ngrok URL into Twilio

In Twilio, navigate to your phone number and paste the ngrok URL into the URL field:

![Twilio config](image.png)

## Test it Out

You can use https://mynoise.net/ to generate background noise for testing. Once the noise generator is playing, call your Twilio number and say a few things. Hang up.

When the websocket disconnects, the server will create two files: `twilio_call_filtered.wav` and `twilio_call_unfiltered.wav`.

## Visualize the Filter

Open the `wav_visualizer.ipynb` notebook and run the code cell.