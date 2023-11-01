import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import 'dotenv/config';
import pino from 'pino'; // Import Pino

const logger = pino(); // Create a Pino logger
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//You will only need this line for localhost self-cert SendGrid REST API
//If you don't plan on using SendGrid with the REST method below or
//if your dev environment isn't localhost but a secure HTTPS standard website URL,
//then you will not need this line and shouldn't use it (for security)

const port = process.env.PORT || 3001;
const environment = process.env.ENVIRONMENT || 'sandbox';
const client_id = process.env.PAYPAL_CLIENT_ID;
const client_secret = process.env.PAYPAL_SECRET_KEY;
const endpoint_url = environment === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

/**
 * Creates an order and returns it as a JSON response.
 * @function
 * @name createOrder
 * @memberof module:routes
 * @param {object} req - The HTTP request object.
 * @param {object} req.body - The request body containing the order information.
 * @param {string} req.body.intent - The intent of the order.
 * @param {object} res - The HTTP response object.
 * @returns {object} The created order as a JSON response.
 * @throws {Error} If there is an error creating the order.
 */

app.use('/initiate-payment', cors());

app.post('/initiate-payment', async (req, res) => {
    try {
        const access_token = await get_access_token();
        
        // Get payment details and currency from the client request
        const { cardNumber, cardHolder, expiry, cvv, currency, amount } = req.body;

        // You can use these variables to construct the payment order data
        let order_data_json = {
            'intent': "CAPTURE",
            'purchase_units': [{
                'amount': {
                    'currency_code': currency,
                    'value': amount
                }
            }]
            // Add other payment details if needed
        };
        
        const data = JSON.stringify(order_data_json);

        const response = await fetch(endpoint_url + '/v2/checkout/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            },
            body: data
        });

        if (response.ok) {
            const json = await response.json();
            res.send(json);
        } else {
            throw new Error(`Failed to create payment order. Status: ${response.status}`);
        }
    } catch (err) {
        logger.error(err); // Use Pino for logging errors
        res.status(500).send(err);
    }
});


/**
 * Completes an order and returns it as a JSON response.
 * @function
 * @name completeOrder
 * @memberof module:routes
 * @param {object} req - The HTTP request object.
 * @param {object} req.body - The request body containing the order ID and intent.
 * @param {string} req.body.order_id - The ID of the order to complete.
 * @param {string} req.body.intent - The intent of the order.
 * @param {string} [req.body.email] - Optional email to send receipt.
 * @param {object} res - The HTTP response object.
 * @returns {object} The completed order as a JSON response.
 * @throws {Error} If there is an error completing the order.
 */
app.post('/complete_order', async (req, res) => {
    try {
        const access_token = await get_access_token();
        const response = await fetch(endpoint_url + '/v2/checkout/orders/' + req.body.order_id + '/' + req.body.intent, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            }
        });

        if (response.ok) {
            const json = await response.json();
            loggert.info(json);

            if (json.id) {
                send_email_receipt({ "id": json.id, "email": req.body.email });
            }

            // Set the status and content type of the response
            res.status(200).json(json);
        } else {
            throw new Error(`Failed to complete order. Status: ${response.status}`);
        }
    } catch (err) {
        logger.error(err);
        // Set the status and content type for the error response
        res.status(500).json({ error: err.message });
    }
});


/**
 * Retrieves a client token and returns it as a JSON response.
 * @function
 * @name getClientToken
 * @memberof module:routes
 * @param {object} req - The HTTP request object.
 * @param {object} req.body - The request body containing the access token and optional customer ID.
 * @param {string} req.body.access_token - The access token used for authorization.
 * @param {string} [req.body.customer_id] - Optional customer ID to be included in the request.
 * @param {object} res - The HTTP response object.
 * @returns {object} The client token as a JSON response.
 * @throws {Error} If there is an error retrieving the client token.
 */
app.post("/get_client_token", async (req, res) => {
    try {
        const access_token = await get_access_token();

        const payload = req.body.customer_id
            ? JSON.stringify({ customer_id: req.body.customer_id })
            : null;

        const response = await fetch(endpoint_url + "/v1/identity/generate-token", {
            method: "post",
            headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
            },
            body: payload,
        });

        if (response.ok) {
            const data = await response.json();
            res.send(data.client_token);
        } else {
            throw new Error(`Failed to retrieve client token. Status: ${response.status}`);
        }
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("An error occurred while processing the request.");
    }
});
  

// Helper / Utility functions

//Servers the index.html file
app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/index.html');
});
//Servers the style.css file
app.get('/style.css', (req, res) => {
    res.sendFile(process.cwd() + '/style.css');
});
//Servers the script.js file
app.get('/script.js', (req, res) => {
    res.sendFile(process.cwd() + '/script.js');
});


//PayPal Developer YouTube Video:
//How to Retrieve an API Access Token (Node.js)
//https://www.youtube.com/watch?v=HOkkbGSxmp4
async function get_access_token() {
    const auth = `${client_id}:${client_secret}`;
    const data = 'grant_type=client_credentials';

    try {
        const response = await fetch(endpoint_url + '/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(auth).toString('base64')}`
            },
            body: data
        });
        
        if (response.ok) {
            const json = await response.json();
            return json.access_token;
        } else {
            throw new Error(`Failed to retrieve access token. Status: ${response.status}`);
        }
    } catch (error) {
        throw error;
    }
}

app.listen(port, () => {
    logger.info(`Server listening at http://localhost:${port}`);
});