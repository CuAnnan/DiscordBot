const   Discord = require('discord.js'),
        client = new Discord.Client(),
        Bot = require('./DiscordBot'),
        conf = require('./conf.json');

/**
 * This is from the discord.js client documentation.
 */
client.login(conf.clientToken);

client.once(
    'ready',
    function()
    {
        console.log(`Logged in as ${client.user.username}`);
        bot = new Bot(conf);
        bot.hoist(client).then(
            function()
            {
                console.log('Hoisted Bot');
            }
        );
    }
);

process.on(
    'SIGINT',
    function()
    {
        console.log('Shutting down bot');
        bot.shutdown().then(
            ()=>{
                console.log('Shutting down app');
                process.exit();
            }
        );

    }
);