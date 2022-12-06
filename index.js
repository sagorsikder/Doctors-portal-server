const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

const app = express();

// middleware 
app.use(cors())
app.use(express.json())

app.get('/', async(req,res)=>{
    res.send('server running');
})




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.edl5qg1.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function sendBookingEmail(booking){

    const {email,treatment,appointmentDate,slot} = booking;
    let transporter = nodemailer.createTransport({
        host: "smtp.sendgrid.net",
        port: 587,
     
        auth: {
          user: "apikey",
          pass: process.env.SENDGRID_API_KEY
        }
      });

      transporter.sendMail({
        from: "SENDER_EMAIL", // verified sender email
        to: email, // recipient email
        subject: `your appointment for ${treatment} is confirmed`, // Subject line
        text: "Hello world!", // plain text body
        html: `
        <h3> Your appointment is confirmed </h3>
        <div>
            <p> Your appointment for treatment : ${treatment}</p>
            <p> Please visit us on ${appointmentDate} at ${slot}</p>
            <p> Thanks from doctors portal. </p>
        </div>
        `, // html body
      }, function(error, info){
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      })
}

const verifyJWT =(req,res,next)=>{

 
     const authHeader = req.headers.authorization;
     if(!authHeader){
       return res.status(401).send('unauthorized user')
     }

     const token = authHeader.split(' ')[1]

    jwt.verify(token,process.env.ACCESS_TOKEN,function(err,decoded){
        if(err){
            return res.status(403).send({message:'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){

    try{
        const optionsCollection = client.db('doctors-portal').collection('doctorsOptions')
        const bookingsCollection = client.db('doctors-portal').collection('bookings')
        const usersCollection = client.db('doctors-portal').collection('users')

        app.get('/options',async(req,res)=>{

            const query = {};
            const options = await optionsCollection.find(query).toArray()

            
            const date = req.query.date;
            
            const bookingQuery = {appointmentDate:date}
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray()
           
            console.log('test')
            options.forEach(option=>{
                const optionBooked = alreadyBooked.filter(book=>book.treatment === option.name)
                const bookedSlots = optionBooked.map(book=>book.slot)

               const remainingSlots = option.slots.filter(slot=> !bookedSlots.includes(slot))
                option.slots = remainingSlots;
               console.log(remainingSlots.length)
               
            })
            res.send(options)

        })

        app.get('/bookings',verifyJWT,async(req,res)=>{
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            

            if(email!== decodedEmail){
              return  res.status(403).send({message:'Forbidden access.'})
            }


            const query = {
                email:email
            }
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings)
        })

        app.post('/bookings',async(req,res)=>{
          
            const booking = req.body;

            const query = {
                appointmentDate : booking.appointmentDate,
                treatment : booking.treatment,
                email : booking.email
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if(alreadyBooked.length){
                const message = `You already have a booking on ${booking.appointmentDate}`
                return res.send({acknowledged:false,message})
            }

            const result = await bookingsCollection.insertOne(booking)

            // send email about appointment confirmation
            sendBookingEmail(booking)
            res.send(result)
        })


        app.get('/jwt', async(req,res)=>{
            const email = req.query.email;
            const query = {
                email:email
            }
            const user = await usersCollection.findOne(query)


            if(user){
                const token = jwt.sign({email},process.env.ACCESS_TOKEN,{expiresIn: '1h' })
                res.send({accessToken:token})
            }


            console.log(user)
            res.status(403).send({accessToken:'token'})
        })

        app.get('/users',async(req,res)=>{
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })


        app.post('/users',async(req,res)=>{
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.put('/users/admin/:id',async (req,res)=>{
            const id = req.params.id;
            const filter = {_id:ObjectId(id)}
            const options = {upsert:true}
            const updateDoc = {
                $set : {
                    role : 'admin'
                }
            }

            const result = await usersCollection.updateOne(filter,updateDoc,options);
            res.send(result)
        })

    }
    finally{

    }
}

run().catch(console.log)


app.listen(port,()=>console.log('port running on ',port))

