const {Client, ApplicationCommandOptionType} = require("discord-http-interactions");
const Enmap = require("enmap");
const SteamAuth = require("node-steam-openid");
require("dotenv/config");
const DiscordTokens = require("./discordTokens");
const { crypt, decrypt } = require("./crypt");
const cookieParser = require("cookie-parser");

const db = new Enmap({name: "steam-discord"});
const dcTokens = new DiscordTokens();

const steam = new SteamAuth(
    {
        realm: "URL_HERE",
        returnUrl: "URL_HERE/api/steam/callback",
        apiKey: process.env.steamAPIToken
    }
);

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
        },
        {
            name: "site",
            method: "GET",
            endpoint: "/"
        },
        {
            name: "steamCallback",
            method: "GET",
            endpoint: "/api/steam/callback"
        },
        {
            name: "steamAuth",
            method: "GET",
            endpoint: "/api/steam/link"
        },
        {
            name: "steamDeauth",
            method: "GET",
            endpoint: "/api/steam/unlink"
        },
        {
            name: "discordLogin",
            method: "GET",
            endpoint: "/api/discord/login"
        },
        {
            name: "panel",
            method: "GET",
            endpoint: "/api/panel"
        },
        {
            name: "logout",
            method: "GET",
            endpoint: "/logout"
        },
        {
            name: "catchall",
            method: "GET",
            endpoint: "*"
        }
    ]
});

dcclient.app.set("views", "./html");
dcclient.app.use(cookieParser());

dcclient.on("ready",()=>{
    db.defer.then(()=>{
        console.log("SCPAuthenticator active.");
    });
    //registerCommands();
});

dcclient.on("interaction",(ic)=>{
    if(ic.commandName === "link"){
        if(debugMode) console.log("Link interaction received!");
        newAccCmd(ic);
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

dcclient.on("dcacc", (req, res)=>{
    const found = Array.from(db.values()).find(x => x.discordID === req.params.dcid);
    if(debugMode) console.log(`DC acc check request made for: ${req.params.dcid}`);
    return res.send(JSON.stringify(found));
});

dcclient.on("catchall", (req, res)=>{
    if(debugMode) console.log(`Request to ${req.originalUrl}`);
    return res.sendStatus(404);
});

dcclient.on("site", (req, res)=>{
    if(req.cookies["sigma"]) return res.redirect("/api/panel");
    res.render('landingPage.ejs');
});

dcclient.on("steamCallback", (req, res)=>{
    steam.authenticate(req).then(async user => {
        if(req.cookies["sigma"]){
            discID = await decrypt(process.env.cryptoKey,req.cookies["sigma"]).catch(e => console.log(e));
        }
        if(discID !== undefined && db.has(discID)){
            const dbuser = db.get(discID);
            dbuser.steamID = user.steamid;
            dbuser.steamObj = user;
            db.set(dbuser.discordID,dbuser);
            res.render('panel.ejs', { data: {dbuser} });
        } else {
            res.clearCookie("sigma").redirect("/");
        }
    }).catch(e => {
        console.log(e);
        res.redirect("/");
    });
});

dcclient.on("steamDeauth", async (req, res)=>{
    if(req.cookies["sigma"]){
        discID = await decrypt(process.env.cryptoKey,req.cookies["sigma"]).catch(e => console.log(e));
    }
    if(discID !== undefined && db.has(discID)){
        const dbuser = db.get(discID);
        dbuser.steamID = null;
        dbuser.steamObj = null;
        db.set(dbuser.discordID,dbuser);
        res.render("panel.ejs", { data: {dbuser} });
    } else {
        res.clearCookie("sigma").redirect("/");
    }
});

dcclient.on("steamAuth", async (req, res)=>{
    return res.redirect(await steam.getRedirectUrl());
});

dcclient.on("discordLogin", (req, res)=>{
    let urlData = {};
    req.url = req.url
        .replace(/&amp;/gim,"&")
        .replace(/&nbsp;/gim,"")
        .replace(/&quot;/gim,"\"")
        .replace(/&lt;/gim,"<")
        .replace(/&gt;/gim,">");
    req.url.split("?")[1].split("&").forEach(x => {const param = x.split("=");if(param.length === 2 && param[1] !== "") urlData[param[0]] = param[1];});
    dcTokens.discordOauthExchange(urlData.code).then(async dcuser => {
        newAccount(null, dcuser.id, dcuser.guilds, dcuser);
        const sigma = await crypt(process.env.cryptoKey, dcuser.id);
        res.cookie("sigma", sigma).redirect("/api/panel");
    });
});

dcclient.on("panel", async (req, res)=>{
    let discID;
    if(req.cookies["sigma"]){
        discID = await decrypt(process.env.cryptoKey,req.cookies["sigma"]).catch(e => console.log(e));
    }
    if(discID !== undefined && db.has(discID)){
        dcTokens.getDiscordInformation(discID).then(dcuser => {
            const dbuser = db.get(discID);
            dbuser.discordObj = dcuser;
            res.render('panel.ejs', { data: {dbuser} });
        }).catch(e => {
            console.log(e);
            res.clearCookie("sigma").redirect("/");
        });
    } else {
        res.clearCookie("sigma").redirect("/");
    }
});

dcclient.on("logout",(req,res)=>{
    res.clearCookie("sigma").redirect("/");
});

dcclient.login();

function newAccCmd(ic){
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
    newAccount(newID, ic.member.user.id, [ic.guildId]);
    ic.reply({
        content: "Link successful!",
        ephemeral: true
    });
}

function newAccount(id, userID, guildIDArr = [], dcuser){
    console.log(id, userID, guildIDArr);
    let dbUser;
    if(db.has(userID)){
        dbUser = db.get(userID);
        console.log("User found from DB: " + userID);
        guildIDArr.forEach(gID => {
            if(!dbUser.guilds.includes(gID)) dbUser.guilds.push(gID);
        })
    } else {
        console.log("Creating new user for: " + userID);
        dbUser = {
            steamID: id,
            guilds: guildIDArr,
            discordID: userID,
            lastUpdated: Date.now()
        }
    }
    if(dcuser !== undefined){
        dbUser.discordObj = dcuser;
    }
    db.set(userID, dbUser);
}

function registerCommands(){
    dcclient.registerCommands(process.env.discordId,[
        {
            name: "link",
            description: "Link your Discord and Steam accounts to play SEKASIN games!",
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