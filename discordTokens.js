const Enmap = require("enmap");
const axios = require("axios");
const {URLSearchParams} = require("url");
const redirectUri = "URL_HERE/api/discord/login";

class DiscordTokens {
    tokenDatabase;
    constructor() {
        this.tokenDatabase = new Enmap({name: "discord-tokens"});
    }

    saveTokens(id, tokens){
        tokens.expires_at = Date.now() + (tokens.expires_in*1000);
        this.tokenDatabase.set(id, tokens);
    }

    getToken(id){
        return new Promise((res, rej)=>{
            if(!this.tokenDatabase.has(id)) rej(new Error(`USER_NOT_IN_DB: Requested user ${id} is not logged in the Database.`));
            let tokens = this.tokenDatabase.get(id);
            if(Date.now() > tokens.expires_at){
                const data = new URLSearchParams();
                data.append("client_id",process.env.discordId);
                data.append("client_secret",process.env.discordSecret);
                data.append("grant_type","refresh_token");
                data.append("refresh_token",tokens.refresh_token);
                axios.post("https://discord.com/api/oauth2/token",data,{headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).then(d => {
                    console.log(`${id} discord-token-refreshed.`);
                    const tokens = d.data;
                    this.saveTokens(id, tokens);
                    res(`${tokens.token_type} ${tokens.access_token}`);
                }).catch(e => {rej(e.message);});
            } else {
                res(`${tokens.token_type} ${tokens.access_token}`);
            }
        });
    }

    discordOauthExchange(code) {
        return new Promise((res,rej)=>{
            const data = new URLSearchParams();
            data.append("client_id",process.env.discordId);
            data.append("client_secret",process.env.discordSecret);
            data.append("grant_type","authorization_code");
            data.append("code",code);
            data.append("redirect_uri",redirectUri);
            axios.post("https://discord.com/api/oauth2/token",data,{headers: {"Content-Type":"application/x-www-form-urlencoded"}}).then(x => {
                const tokens = x.data;
                axios.get("https://discord.com/api/users/@me",{headers: {"authorization": `${tokens.token_type} ${tokens.access_token}`}}).then(y => {
                    const user = y.data;
                    this.saveTokens(user.id, tokens);
                    res(user);
                }).catch(e => {console.log("Discord user information failed."); rej(e)});
            }).catch(e => {console.log("Discord token failed."); rej(e)});
        });
    }

     getDiscordInformation(id) {
        return new Promise(async (res,rej)=>{
            this.getToken(id).then(accessToken => {
                axios.get("https://discord.com/api/users/@me",{headers: {"authorization": accessToken}}).then(y => {
                    res(y.data);
                }).catch(e => {rej(e)});
            }).catch(e => rej(e));
        });
    }
}

module.exports = DiscordTokens;