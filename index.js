const express = require('express');
const app = express();
const path = require("path");
const fs = require("fs");

const port = 3000;
app.set('view engine', 'ejs');

app.use(express.static('public'));

async function main(){
  const OpenAI = require('openai')
  const openai = new OpenAI()
  const assistant = await openai.beta.assistants.create({
    name: "PHASE",
    instructions: "You are PHASE, the Personal Health Assistant for Space Exploration. You are to monitor an astronaut's physical and mental health status, providing medical advice and companionship. Be sure to also focus on providing comfort for mental well-being. You will be periodically given system messages with the astronaut's status, and should only respond when helpful or necessary for the astronaut's well-being (otherwise, send a blank message). However, if the astronaut addresses you directly, please do acknowledge them. These messages are read aloud, so please keep them concise. The astronaut's messages are also said aloud, so pick up on typos if appropriate. If you need to send an emergency message to mission control, separate the message to the astronaut and the mission control message with [MISSION_CONTROL], sending your message AFTER the tag's closed brackets (not inside). Please do respond to the astronaut as well before this tag is placed– try to comfort them if their vitals are critical. Only send raw text (no asterisks or formatting). ALWAYS end sent messages with [END_MESSAGE]",
    tools: [],
    model: "gpt-4o-mini"
  });
  async function gptResponse(userMessage, threadID=0, role="user") {
    userMessage = userMessage + '.';
      if(threadID == 0){
          const thread = await openai.beta.threads.create();
          threadID = thread.id;
      }
      const message = await openai.beta.threads.messages.create(
          threadID,
          {
              role: "user",
              content: (role === "system" ? "If results aren't abnormal, refrain from responding. SYSTEM:" : "") + userMessage
          }
      );

      return new Promise((resolve, reject) => {
          let serviceResponse = "";

          openai.beta.threads.runs.stream(threadID, {
              assistant_id: assistant.id
          })
          .on('textDelta', async (textDelta) => {
              serviceResponse += textDelta.value;

              if (serviceResponse.includes("[END_MESSAGE]")) {
                resolve(JSON.stringify({message: serviceResponse.slice(0, serviceResponse.indexOf("[END_MESSAGE]")).trim(), id: threadID}));
              }
          })
          .on('error', (error) => {
              reject(error);
          });
      });
  }
  
  
  app.get('/', async (req, res) => {
    res.render("index", {gptResponse: await gptResponse})
  })
  
  const locationsRouter = require('./routes/locations')
  
  app.use('/locations', locationsRouter)

  var threadSpeeches = {};
  app.post('/api/user-message', async (req, res) => {
    const userInput = req.query.input;
    const threadID = req.query.threadID;
    const requestedVoice = req.query.voice;
    try {
      gptResponseMessage = await gptResponse(userInput, threadID);
      if(threadSpeeches[JSON.parse(gptResponseMessage).id] == undefined) threadSpeeches[JSON.parse(gptResponseMessage).id] = 1;
      else threadSpeeches[JSON.parse(gptResponseMessage).id] = threadSpeeches[JSON.parse(gptResponseMessage).id] + 1;
      const speechFile = path.resolve("./public/speech/" + JSON.parse(gptResponseMessage).id + "-" + threadSpeeches[JSON.parse(gptResponseMessage).id] +".mp3");
      rawGptResponseMessage = JSON.parse(gptResponseMessage);
      rawGptResponseMessage["speechPath"] = "speech/" + JSON.parse(gptResponseMessage).id + "-" + threadSpeeches[JSON.parse(gptResponseMessage).id] +".mp3";
      gptResponseMessage = JSON.stringify(rawGptResponseMessage);
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: requestedVoice,
        input: JSON.parse(gptResponseMessage).message.replaceAll("*", ""),
      });
      console.log(speechFile);
      const buffer = Buffer.from(await mp3.arrayBuffer());
      await fs.promises.writeFile(speechFile, buffer);
      console.log(gptResponseMessage)
        res.json({ response: gptResponseMessage });
    } catch (error) {
        console.error('Error getting GPT response:', error);
        res.status(500).json({ error: 'Failed to get response from GPT' });
    }
  });

  app.post('/api/system-message', async (req, res) => {
    const userInput = req.query.input;
    const threadID = req.query.threadID;
    const requestedVoice = req.query.voice;
    try {
        gptResponseMessage = await gptResponse(userInput, threadID, role="system");
        if(threadSpeeches[JSON.parse(gptResponseMessage).id] == undefined) threadSpeeches[JSON.parse(gptResponseMessage).id] = 1;
        else threadSpeeches[JSON.parse(gptResponseMessage).id] = threadSpeeches[JSON.parse(gptResponseMessage).id] + 1;
        const speechFile = path.resolve("./public/speech/" + JSON.parse(gptResponseMessage).id + "-" + threadSpeeches[JSON.parse(gptResponseMessage).id] +".mp3");
        rawGptResponseMessage = JSON.parse(gptResponseMessage);
        rawGptResponseMessage["speechPath"] = "speech/" + JSON.parse(gptResponseMessage).id + "-" + threadSpeeches[JSON.parse(gptResponseMessage).id] +".mp3";
        gptResponseMessage = JSON.stringify(rawGptResponseMessage);
        const mp3 = await openai.audio.speech.create({
          model: "tts-1",
          voice: requestedVoice,
          input: JSON.parse(gptResponseMessage).message.replaceAll("*", ""),
        });
        console.log(speechFile);
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(speechFile, buffer);
        console.log(gptResponseMessage)
          res.json({ response: gptResponseMessage });
    } catch (error) {
        console.error('Error getting GPT response:', error);
        res.status(500).json({ error: 'Failed to get response from GPT' });
    }
});
  
  app.listen(port, () => {
    console.log(`App listening on port ${port}`)
  })
}

main();