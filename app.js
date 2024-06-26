const { createCanvas, registerFont } = require('canvas');
const currency = require('currency.js');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { Readable } = require('stream');
const mongoose = require('mongoose');
const dailyCalls = require('./Models/dailyCalls');
require("dotenv").config();
const axios = require('axios');

mongoose.connect(process.env.DB_URI).catch(() => console.log("err conneting"));

function createReadableStreamFromBase64URI(base64URI) {
    // Extract the base64 data
    const base64Data = base64URI.split(';base64,').pop();

    // Convert base64 data to a buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Create a readable stream from the buffer
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null); // Signal the end of the stream

    return readableStream;
}

async function sendImageWithCaption(chatId, stream, caption, botToken) {
    try {
        // Prepare the form data
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', stream, { filename: 'img.png' }); // Pass the readable stream directly
        formData.append('caption', caption);

        // Send the image with caption to the Telegram bot API
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            body: formData
        });
    } catch (err) {
    }
}
 
function generateImageWithText(amt, fontPath, width, height, capt) {

    // Register the custom font
    registerFont(fontPath, { family: 'CustomFont' });
    
    // Create a canvas
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    // Measure text metrics to calculate vertical centering
    function measureTextMetrics(fontSize) {
        context.font = `${fontSize}px CustomFont`;
        const metrics = context.measureText(amt);
        const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8; // Fallback for browsers not supporting actualBoundingBoxAscent
        const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2; // Fallback for browsers not supporting actualBoundingBoxDescent
        return { ascent, descent };
    }

    // Function to find the vertical position that centers the text within the canvas
    function findVerticalCenterPosition(fontSize) {
        const { ascent, descent } = measureTextMetrics(fontSize);
        return (height - (ascent + descent)) / 2 + ascent; // Adjusted position to center text
    }

    // Function to measure text width for a given font size
    function measureTextWidth(fontSize) {
        context.font = `${fontSize}px CustomFont`;
        return context.measureText(amt).width;
    }

    // Function to find the maximum font size that fits the text within the canvas
    function findMaxFontSize() {
        let fontSize = 1;
        let textWidth = measureTextWidth(fontSize);

        while (textWidth < width && fontSize < height) {
            fontSize++;
            textWidth = measureTextWidth(fontSize);
        }

        return fontSize - 1; // Return the previous font size that fit within the canvas
    }

    // Calculate the maximum font size
    const maxFontSize = findMaxFontSize();

    // Calculate the vertical center position
    const centerY = findVerticalCenterPosition(maxFontSize);

    // Set font properties with the maximum font size
    context.font = `${maxFontSize}px CustomFont`;
    context.fillStyle = '#6CC04A'; // Set font color to green

    // Set border properties
    const borderWidth = 1.8; // Border width in pixels
    context.strokeStyle = 'black'; // Set border color to black

    // Position the text horizontally in the center
    const x = (width - measureTextWidth(maxFontSize)) / 2;

    // Draw the text with border
    for (let xOffset = -borderWidth; xOffset <= borderWidth; xOffset++) {
        for (let yOffset = -borderWidth; yOffset <= borderWidth; yOffset++) {
            if (xOffset !== 0 || yOffset !== 0) {
                context.strokeStyle = 'black'; // Set border color to black
                context.strokeText(amt, x + xOffset, centerY + yOffset);
            }
        }
    }

    // Draw the main text on the canvas
    context.fillText(amt, x, centerY);

    // Convert canvas to a data URL
    const dataURL = canvas.toDataURL();
    const stream = createReadableStreamFromBase64URI(dataURL);
    sendImageWithCaption(chatId,stream,capt,botToken);
}

//!!!!!!
//you will have to change this function and retrive data from your database here.
async function getTodaysSearchAPICalls() {
    try {
      // Get today's date in the same format as stored in the database
      const currentDate = new Date();
      const day = currentDate.getDate().toString().padStart(2, '0');
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const year = currentDate.getFullYear().toString().slice(-2);
      const formattedDate = `${day}/${month}/${year}`;
      //const formattedDate = `07/04/24`;
      // Query the database to find the document with today's date
      const todayCalls = await dailyCalls.findOne({ date: formattedDate });
  
      if (!todayCalls) {
        // If no document found for today, return 0 calls
        return 0;
      }
  
      // Return the number of calls for the "searchapi" service
      return todayCalls.services.get('searchapi') || 0;
      //change service here
    } catch (error) {
      // Handle any errors that might occur during the database query
      console.error("Error retrieving today's API calls for searchapi:", error);
      throw error; // You can choose to throw the error or handle it differently
    }
  }

const botToken = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const USD = value => currency(value, { symbol: "$", precision: 2 });

getTodaysSearchAPICalls().then((calls) => {
    //I am converting also as I live in INDIA and also want to see in INR. you can add your desired currencies also.
    //register on rapidapi for this service 1000 calls per month are free! lol we only need about 30 per month
    //so it is forever free for us
    const options = {
        method: 'GET',
        url: 'https://currency-conversion-and-exchange-rates.p.rapidapi.com/convert',
        params: {
          from: 'USD',
          to: 'INR',
          amount: calls*0.005
        },
        headers: {
          'X-RapidAPI-Key': process.env.RAPID_API_KEY,
          'X-RapidAPI-Host': 'currency-conversion-and-exchange-rates.p.rapidapi.com'
        }
      };
    axios.request(options).then(resp =>{
    const amt = USD(calls*0.005).format();
    //as currency.js does not support inr formatting directly so I added ₹ by my own.
    let inr = currency(resp.data.result, { useVedic: true }).format(); 
    inr = inr.slice(1);
    inr = "₹" + inr;
    generateImageWithText(amt, fontPath = './pricedow.ttf', width = 800, height = 250,`Today's Revenue\nUSD: ${amt}\nINR: ${inr}`);
    mongoose.connection.close();
    })
})

//send directly for testing only
// const options = {
//     method: 'GET',
//     url: 'https://currency-conversion-and-exchange-rates.p.rapidapi.com/convert',
//     params: {
//       from: 'USD',
//       to: 'INR',
//       amount: 70000
//     },
//     headers: {
//       'X-RapidAPI-Key': process.env.RAPID_API_KEY,
//       'X-RapidAPI-Host': 'currency-conversion-and-exchange-rates.p.rapidapi.com'
//     }
// };

// axios.request(options).then(resp =>{
//     let inr = currency(resp.data.result, { useVedic: true }).format(); 
//     inr = inr.slice(1);
//     inr = "₹" + inr;
//     const amt = USD(70000).format();
//     generateImageWithText(amt, fontPath = './pricedow.ttf', width = 800, height = 250,`Today's Revenue\nUSD: ${amt}\nINR: ${inr}`);
// })