import { Client, GatewayIntentBits, TextChannel, Events } from 'discord.js';
import chokidar from 'chokidar';
import path from 'path';
import dotenv from 'dotenv';
import { existsSync } from 'fs';

// Load environment variables
dotenv.config();

// Debug mode
const DEBUG = true;

function debugLog(message: string, ...args: any[]) {
    if (DEBUG) {
        console.log(`[DEBUG] ${message}`, ...args);
    }
}

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'CHANNEL_ID', 'WATCH_PATH'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
    debugLog(`${envVar} is set to: ${envVar === 'DISCORD_TOKEN' ? '[HIDDEN]' : process.env[envVar]}`);
}

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize file watcher
const watcher = chokidar.watch(process.env.WATCH_PATH!, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

// Debug Discord client events
client.on(Events.Debug, info => debugLog('Discord Debug:', info));
client.on(Events.Warn, info => console.warn('Discord Warning:', info));
client.on(Events.Error, error => console.error('Discord Error:', error));

// Handle Discord client ready event
client.on(Events.ClientReady, () => {
    console.log(`✅ Bot successfully logged in as ${client.user?.tag}`);
    debugLog('Bot is ready with following details:', {
        username: client.user?.tag,
        id: client.user?.id,
        guilds: client.guilds.cache.size
    });
    
    // Verify channel access
    verifyChannelAccess();
    setupFileWatcher();
});

async function verifyChannelAccess() {
    try {
        const channel = await client.channels.fetch(process.env.CHANNEL_ID!);
        if (!channel) {
            console.error('❌ Channel not found!');
            return;
        }
        if (!(channel instanceof TextChannel)) {
            console.error('❌ Channel is not a text channel!');
            return;
        }
        
        // Test channel permissions
        const permissions = channel.permissionsFor(client.user!);
        debugLog('Channel permissions:', {
            sendMessages: permissions?.has('SendMessages'),
            attachFiles: permissions?.has('AttachFiles'),
            viewChannel: permissions?.has('ViewChannel')
        });
        
        if (!permissions?.has('SendMessages') || !permissions?.has('AttachFiles')) {
            console.error('❌ Bot lacks required permissions in the channel!');
            return;
        }
        
        console.log(`✅ Successfully verified access to channel: ${channel.name}`);
    } catch (error) {
        console.error('❌ Error verifying channel access:', error);
    }
}

function setupFileWatcher() {
    debugLog('Setting up file watcher for path:', process.env.WATCH_PATH);
    
    watcher.on('ready', () => {
        console.log('✅ File watcher initialized and ready');
    });

    watcher.on('add', async (filePath) => {
        try {
            debugLog('File detected:', filePath);
            
            if (path.extname(filePath).toLowerCase() === '.png') {
                console.log(`📁 New PNG file detected: ${filePath}`);

                if (!existsSync(filePath)) {
                    console.error(`❌ File ${filePath} no longer exists`);
                    return;
                }

                const channel = await client.channels.fetch(process.env.CHANNEL_ID!);
                if (!channel || !(channel instanceof TextChannel)) {
                    throw new Error('Invalid channel or channel not found');
                }

                debugLog('Attempting to send file to Discord...');
                await channel.send({
                    files: [{
                        attachment: filePath,
                        name: path.basename(filePath)
                    }]
                });

                console.log(`✅ Successfully posted ${filePath} to Discord`);
            }
        } catch (error) {
            console.error('❌ Error processing file:', error);
            debugLog('Error details:', error);
        }
    });
}

// Handle watcher errors
watcher.on('error', error => {
    console.error('❌ File watcher error:', error);
    debugLog('Watcher error details:', error);
});

// Connect to Discord
console.log('🔄 Attempting to connect to Discord...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Failed to connect to Discord:', error);
    debugLog('Login error details:', error);
});