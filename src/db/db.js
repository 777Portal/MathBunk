const { MongoClient, ServerApiVersion } = require('mongodb');

const { 
  dbUri: uri,
} = require('../../config/config.json');


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let clientObj = null;
async function initConnection() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    return true
  } 
  catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    return false;
  } 
   finally {
    clientObj = client
  }
}

async function get() {
  if (clientObj == null) return false;
  return clientObj
}

async function save(database, collection, json) {
  if (!database || !collection || !json) return;
  
  const clientDb = clientObj.db(database);
  const coll = clientDb.collection(collection);
  
  await coll.insertOne(json);
  console.log(`inserted into ${collection}:`, json.stack);
  return true;
}

async function update(database, collectionName, key, value, updateValue) {
  if (!database || !collectionName || !key || !value) return;

  const collection = client.db(database).collection(collectionName);
  const query = { [key]: value };

  try {
    const updated = await collection.updateOne(query, { $set: updateValue });
    return updated;
  } catch (error) {
    console.log(error);
    return false;
  }
}

async function checkIfKeyExists(database, collectionName, key, value) {
  if (!database || !collectionName || !key || !value) return
  const collection = client.db(database).collection(collectionName);

  const query = { [key]: value };
  const keyExists = await collection.findOne(query);

  return !!keyExists;
}

async function findOne(database, collectionName, query) {
  if (!database || !collectionName || !query) return``
  const collection = client.db(database).collection(collectionName);
  
  try{
    const getKey = await collection.findOne(query);
    return getKey;
  } catch (error){
    console.log(error)
    return false;
  }
}

async function closeConnection() {
  if (clientObj) {
    await clientObj.close();
    console.log("Closed db connection");
  }
}

module.exports = {
  save,
  get,
  initConnection,
  checkIfKeyExists,
  findOne,
  closeConnection,
  update
};