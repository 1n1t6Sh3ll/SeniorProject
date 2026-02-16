const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

class RealtimeManager {
    constructor(server) {
        this.wss = new WebSocketServer({ server });
        this.clients = new Set();
        this.setupWebSocketServer();
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws) => {
            console.log('🔌 New WebSocket connection');
            this.clients.add(ws);

            // Send initial connection message
            ws.send(JSON.stringify({ type: 'connected', message: 'Connected to server' }));

            // Heartbeat to keep connection alive
            const heartbeat = setInterval(() => {
                if (ws.isAlive === false) {
                    ws.terminate();
                    return;
                }
                ws.isAlive = false;
                ws.ping();
            }, 30000);

            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            ws.on('close', () => {
                console.log('🔌 WebSocket disconnected');
                this.clients.delete(ws);
                clearInterval(heartbeat);
            });
        });
    }

    handleMessage(ws, message) {
        switch (message.type) {
            case 'subscribe':
                ws.subscription = message.channel;
                ws.send(JSON.stringify({ type: 'subscribed', channel: message.channel }));
                break;
            case 'unsubscribe':
                ws.subscription = null;
                ws.send(JSON.stringify({ type: 'unsubscribed' }));
                break;
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    }

    broadcast(data) {
        const message = JSON.stringify(data);
        this.clients.forEach((client) => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(message);
            }
        });
    }

    broadcastToChannel(channel, data) {
        const message = JSON.stringify(data);
        this.clients.forEach((client) => {
            if (client.readyState === 1 && client.subscription === channel) {
                client.send(message);
            }
        });
    }

    close() {
        this.clients.forEach((client) => {
            client.close();
        });
        this.wss.close();
    }
}

module.exports = RealtimeManager;
