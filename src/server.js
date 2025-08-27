const app=require('./app');
require('dotenv').config({ quiet: true });

const PORT=process.env.PORT||5001;

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
    
})