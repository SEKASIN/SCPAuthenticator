const {Client, ApplicationCommandOptionType} = require("discord-http-interactions");
const Enmap = require("enmap");
require("dotenv/config");

const db = new Enmap({name: "steam-discord"});

const debugMode = false;

const dcclient = new Client({
    token: process.env.discordToken,
    publicKey: process.env.discordKey,
    port: process.env.port,
    endpoint: "/api/interactions",
    additionalEndpoints: [
        {
            name: "acc",
            method: "GET",
            endpoint: "/auth/:steam"
        }, {
            name: "catchall",
            method: "GET",
            endpoint: "*"
        }
    ]
});

dcclient.on("ready",()=>{
    db.defer.then(()=>{
        console.log("SCPAuthenticator active.");
    });
    //registerCommands();
});

dcclient.on("interaction",(ic)=>{
    if(ic.commandName === "link"){
        if(debugMode) console.log("Link interaction received!");
        newAccount(ic);
    }
});

dcclient.on("acc", (req, res)=>{
    const found = Array.from(db.values()).find(x => x.steamID === req.params.steam);
    if(debugMode) console.log(`Account check request received, result: ${req.params.steam} -> ${found === undefined ? "false" : process.env.checkIfInGuildId === undefined ? "true" : found.guilds.includes(process.env.checkIfInGuildId)}`);
    return res.send(
        found === undefined ?
            "false"
            : process.env.checkIfInGuildId === undefined ?
                "true"
                : `${found.guilds.includes(process.env.checkIfInGuildId)}`
    );
});

dcclient.on("catchall", (req, res)=>{
    if(debugMode) console.log(`Request to ${req.originalUrl}`);
    return res.sendStatus(404);
});

dcclient.login();

function newAccount(ic){
    const newID = ic.data.options[0].value;
    const rx = /\d{15,21}/gi;
    if(!rx.test(newID)) ic.reply({
        content: "Hey! SteamID64 is only numbers! Check your input.",
        ephemeral: true
    });
    const found = Array.from(db.values()).find(x => x.steamID === newID);
    if(found !== undefined) return ic.reply({
        content: `This Steam account is already linked by <@${found.discordID}>`,
        ephemeral: true
    });
    let dbUser;
    if(db.has(ic.member.user.id)){
        dbUser = db.get(ic.member.user.id);
        console.log("User found from DB: " + ic.member.user.id);
        if(!dbUser.guilds.includes(ic.guildId)) dbUser.guilds.push(ic.guildId);
    } else {
        console.log("Creating new user for: " + ic.member.user.id);
        dbUser = {
            steamID: newID,
            guilds: [ic.guildId],
            discordID: ic.member.user.id,
            lastUpdated: Date.now()
        }
    }
    db.set(ic.member.user.id, dbUser);
    ic.reply({
        content: "Link successful!",
        ephemeral: true
    });
}

function registerCommands(){
    dcclient.registerCommands(process.env.discordId,[
        {
            name: "link",
            description: "Link your Discord and Steam accounts to play games!",
            options: [
                {
                    required: true,
                    type: ApplicationCommandOptionType.String,
                    name: "steamid64",
                    description: "Your SteamID16.",
                    min_length: 15,
                    max_length: 21
                }
            ]
        }
    ]).then(()=>console.log("Registered commands!"));
}
