import { http } from "@google-cloud/functions-framework";

// Cloud Scheduler calls this with a signed GET every minute.
http("handler", (req, res) => {
  const message = req.query.message || req.body?.message || "Hello World!";
  res.status(200).send(message);
});
