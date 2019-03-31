"use strict";
let fs = require('fs');

class DiscordBot
{
	/**
	 * Constructor. Does constructy things.
	 * Note, a bot that has been instantiated does not listen or respond or even connect to its Discord presence, that is done via hoisting it.
	 * @param conf a hash table of config variables
	 */
	constructor(conf)
	{
		/**
		 * A list of commands that the bot should respond to. Rather than being hardcoded here, they're added by the attachCommands method.
		 */
		this.commands = {};

		this.commandPrefix = conf.commandPrefix;

		/**
		 * The command prefix for the bot can be specified on a guild by guild basis. It's stored here as a hash of the {guildId}->{commandPrefix}
		 */
		this.commandPrefixOverrides = {};

		/**
		 * Whether or not, on a guild basis, the bot should try to delete a command the user sends. I like it to, but some people prefer not to have it.
		 */
		this.deleteMessageOverrides = {};

		/**
		 * A list of guild ids to an array of roles that have elevated privileges for that guild
		 */

		this.authorisedRoles = {};
		/**
		 * A list of guild ids to an array of users that have elevated privileges for that user
		 */
		this.authorisedUsers = {};

		/**
		 * attach commands for the bot
		 */
		this.attachCommands();
	}

	/**
	 * The method to hoist the bot
	 * @param client A Discord Client. The bot uses discord.js for this, but you can overload everything if you like. All current code assumes a Discord.js bot
	 */
	async hoist(client)
	{
		/*
		 * Grab some of the client stuff and bind it to instance variables
		 */
		this.client = client;
		this.user = client.user;
		let settings = this.getJSONFromFile(__dirname+'/settings.json'),
			settingsToHoist = this.getSettingsToSave();
		for(let setting in settingsToHoist)
		{
			this[setting] = settings[setting]?settings[setting]:{}
		}
		this.listen();
		
		return settings;
	}
	
	listen()
	{
		this.client.on('message',(message)=>{
			try
			{
				if (message.author.bot)
				{
					return;
				}
				this.processCommand(message);
			}
			catch(e)
			{
				console.warn(e);
			}
		});
		this.client.on('guildMemberRemove',(member)=>{
			let index = this.authorisedUsers[member.guild.id].indexOf(member.user.id);
			if(index >= 0)
			{
				this.authorisedUsers[member.guild.id].splice(index, 1);
			}
		});
	}
	
	getJSONFromFile(path)
	{
		let text = fs.readFileSync(path);
		return JSON.parse(text);
	}
	
	async shutdown()
	{
		return this.saveSettings().then(
			()=>
			{
				console.log('Shutting down client');
				this.client.destroy();
			}
		);
	}
	
	elevateCommand(message)
	{
		let member = message.member,
			authorAuthedRoles = [];
		if(this.authorisedRoles[message.guild.id])
		{
			authorAuthedRoles = member.roles.filterArray((role)=>this.authorisedRoles[message.guild.id].indexOf(role.id) !== -1);
		}
		
		if(message.guild.owner.id === message.author.id || this.authorisedUsers[message.guild.id].indexOf(message.author.id) > -1 || authorAuthedRoles.length > 0)
		{
			return;
		}
		throw new Error('This action is only allowable by the server owner or by authorised users or users with an authorised role');
	}
	
	attachCommand(command, callback, rescope = true)
	{
		if(rescope)
		{
			callback = callback.bind(this);
		}
		
		
		this.commands[command.toLowerCase()] = callback;
	}
	
	attachCommands()
	{
		this.attachCommand('setCommandPrefix', this.setCommandPrefixForGuild);
		this.attachCommand('setCommandDelete', this.setDeleteMessages);
		this.attachCommand('authoriseUsers', this.authoriseUser);
		this.attachCommand('authoriseRole', this.authoriseRole);
		this.attachCommand('showAuthorised', this.showAuthorised);
		this.attachCommand('deauthoriseUsers', this.deauthoriseUser);
		this.attachCommand('deauthoriseRole', this.deauthoriseRole);
		this.addCommandAliases({
			'authoriseUsers':['authoriseUser', 'authUser', 'authUsers'],
			'authoriseRole':['authRole'],
			'deauthoriseUsers':['deauthoriseUser', 'deauthUser', 'deauthUsers'],
			'deauthoriseRole':['deauthRole']
		});
		this.attachCommand('ping', this.ping);
	}

	getDeleteMessageForGuild(guildId)
	{
		if(Object.keys(this.deleteMessageOverrides).indexOf(guildId) < 0)
		{
			return true;
		}
		return this.deleteMessageOverrides[guildId];
	}
	
	async setDeleteMessages(commandParts, message)
	{
		this.elevateCommand(message);
		if(!commandParts.length)
		{
			return;
		}
		let guildSpecificDeleteString = commandParts[0].trim().toLowerCase(),
			guildSpecificDeleteIndex = ['false', 'f', 'n', 'no'].indexOf(guildSpecificDeleteString);
		this.deleteMessageOverrides[message.guild.id] = guildSpecificDeleteIndex < 0;
	}
	
	getCommandPrefixForGuild(guildId)
	{
		if(this.commandPrefixOverrides[guildId])
		{
			return this.commandPrefixOverrides[guildId];
		}
		return this.commandPrefix;
	}
	
	async setCommandPrefixForGuild(commandParts, message)
	{
		this.elevateCommand(message);

		if (!commandParts.length)
		{
			return;
		}
		
		let guildSpecificPrefix = commandParts[0].trim();
		if (guildSpecificPrefix.length > 1)
		{
			return;
		}
		if (guildSpecificPrefix === this.commandPrefix)
		{
			delete this.commandPrefixOverrides[message.guild.id];
		}
		else
		{
			this.commandPrefixOverrides[message.guild.id] = guildSpecificPrefix;
		}
		return this.saveSettings();
	}
	
	async showAuthorised(commandParts, message)
	{
		for(let memberId of this.authorisedUsers[message.guild.id])
		{
			let member = message.guild.members.get(memberId);
			//TODO: Finish this method.
			console.log(member);
		}
	}
	
	async authoriseRole(commandParts, message)
	{
		this.elevateCommand(message);
		if(!commandParts.length)
		{
			return;
		}
		
		let roleName = commandParts.join(' '),
			role = message.guild.roles.find('name', roleName);
		if(role)
		{
			if(!this.authorisedRoles[message.guild.id] || this.authorisedRoles[message.guild.id].indexOf(role.id) === -1)
			{
				this.authorisedRoles[message.guild.id] = this.authorisedRoles[message.guild.id] ? this.authorisedRoles[message.guild.id] : [];
				this.authorisedRoles[message.guild.id].push(role.id);
			}
			else
			{
				message.reply(`${roleName} already has privileges on this server.`);
			}
		}
		else
		{
			message.reply(`I'm sorry, I could not find a role named ${roleName}. Discord role names are case sensitive, please make sure the case is correct.`);
		}
	}
	
	async deauthoriseRole(commandParts, message)
	{
		this.elevateCommand(message);
		if(!commandParts.length)
		{
			return;
		}
		
		let roleName = commandParts.join(' '),
			role = message.guild.roles.find('name', roleName);
		if(role)
		{
			if(!this.authorisedRoles[message.guild.id] || this.authorisedRoles[message.guild.id].indexOf(role.id) === -1)
			{
				message.reply(`Role ${roleName} is not authed on this server`);
				return;
			}
			this.authorisedRoles[message.guild.id].splice(this.authorisedRoles[message.guild.id].indexOf(role.id), 1);
		}
		else
		{
			message.reply(`I'm sorry, I could not find a role named ${roleName}. Discord role names are case sensitive, please make sure the case is correct.`);
		}
	}
	
	async authoriseUser(commandParts, message)
	{
		this.elevateCommand(message);
		
		if(!commandParts.length)
		{
			return;
		}
		
		let alreadyAuthedUsers = [];
		message.mentions.members.forEach((member)=>{
			if (!this.authorisedUsers[message.guild.id] || this.authorisedUsers[message.guild.id].indexOf(member.id) === -1)
			{
				this.authorisedUsers[message.guild.id] = this.authorisedUsers[message.guild.id] ? this.authorisedUsers[message.guild.id] : [];
				this.authorisedUsers[message.guild.id].push(member.id);
			}
			else
			{
				alreadyAuthedUsers.push(member.user.username);
			}
		});
		
		if(alreadyAuthedUsers.length > 0)
		{
			message.reply(`The following users are already authorised ${alreadyAuthedUsers.join(', ')}`);
		}
	}
	
	async deauthoriseUser(commandParts, message)
	{
		this.elevateCommand(message);
		if(!commandParts.length)
		{
			return;
		}
		let notAuthedUsers = [];
		message.mentions.members.forEach((member)=>{
			let index = this.authorisedUsers[message.guild.id].indexOf(member.id);
			if(!this.authorisedUsers[message.guild.id] || index === -1)
			{
				notAuthedUsers.push(member.username);
			}
			else
			{
				this.authorisedUsers[message.guild.id].splice(index, 1);
			}
		});
		if(notAuthedUsers.length)
		{
			message.reply(`The following members didn't have permissions already: ${notAuthedUsers.join(', ')}`);
		}
	}
	
	getSettingsToSave()
	{
		return {
			'commandPrefixOverrides': this.commandPrefixOverrides,
			'deleteMessages':this.deleteMessageOverrides,
			'authorisedUsers':this.authorisedUsers,
			'authorisedRoles':this.authorisedRoles
		};
	}
	
	async saveSettings()
	{
		let settings = this.getSettingsToSave(),
			data = JSON.stringify(settings);
		data = data?data:'{}';
		return new Promise((resolve, reject) => {
			fs.writeFile(
				'./settings.json',
				data,
				'utf8',
				function(err)
				{
					if(err)
					{
						console.log(err);
						reject(err);
					}
					else
					{
						console.log('Save file written');
						resolve(data);
					}
				}
			);
			console.log('Async write called');
		});
	}
	
	addCommandAlias(command, commandAlias)
	{
		this.commands[commandAlias.toLowerCase()] = this.commands[command.toLowerCase()];
	}
	
	addCommandAliases(data)
	{
		for(let command in data)
		{
			for(let alias of data[command])
			{
				this.addCommandAlias(command, alias);
			}
		}
	}
	
	processCommand(message)
	{
		if(!message.guild)
		{
			return;
		}
		if (message.channel.type === 'dm')
		{
			message.channel.send("You cannot use this bot via DM yet for technical reasons");
			return;
		}

		let prefix = this.getCommandPrefixForGuild(message.guild.id),
			mentionRegExp = new RegExp(`^<@!?${this.user.id}>`),
			isMention = message.content.match(mentionRegExp);

		if (!(message.content.startsWith(prefix) || isMention))
		{
			return;
		}

		let args;
		if(isMention)
		{
			let atMention = isMention[0];
			args = message.content.replace(atMention, '').trim().split('--');
		}
		else
		{
			args = message.content.substring(1).trim().split('--');
		}
		let comment = args[1] ? args[1].trim() : '',
			commandParts = args[0].split(' '),
			command = commandParts.shift().toLowerCase();
		this.executeCommand(command, commandParts, message, comment);
	}
	
	executeCommand(command, commandParts, message, comment)
	{
		let maybeDeleteMessage = ()=>{
			if (this.getDeleteMessageForGuild(message.guild.id))
			{
				message.delete().catch(() => {});
			}
		}

		if (this.commands[command])
		{
			let response = this.commands[command](commandParts, message, comment);
			if(response)
			{
				response.then(() => {
					maybeDeleteMessage();
				}).catch((error) => {
					console.warn(error);
				});
			}
			else
			{
				maybeDeleteMessage();
			}
		}
	}
	
	sendDM(user, message)
	{
		user.createDM().then((x)=>{x.send(message);});
	}
	
	cleanMessage(message)
	{
		let concatenatedMessagePart = [],
			concatenatedMessage = [],
			currentMessageLength = 0;
		
		for(let i in message)
		{
			currentMessageLength += message[i].length;
			if(currentMessageLength >= 1800)
			{
				currentMessageLength = 0;
				concatenatedMessage.push(concatenatedMessagePart);
				concatenatedMessagePart = [];
			}
			concatenatedMessagePart.push(message[i]);
		}
		concatenatedMessage.push(concatenatedMessagePart);
		return concatenatedMessage;
	}

	ping(commandParts, message)
	{
		return message.reply('Pong');
	}

}

module.exports = DiscordBot;