import { OutgoingMessage, SupportedMessage as OutgoingSupportedMessages } from "./messages/outgoingMessages";
import { server as WebSocketServer, connection } from "websocket";
import http from 'http';
import { UserManager } from "./UserManager";
import { IncomingMessage, SupportedMessage } from "./messages/incomingMessages";
import { InMemoryStore } from "./store/InMemoryStore";

// HTTP server banaya
const server = http.createServer((req, res) => {
    console.log(new Date() + ' Received request for ' + req.url);
    res.writeHead(404);
    res.end();
});

const userManager = new UserManager();
const store = new InMemoryStore();

// Port 8080 pe listen kar rahe hain
server.listen(8080, () => {
    console.log(new Date() + ' Server is listening on port 8080');
});

// WebSocket server attach kiya
const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

// Origin check (yahan sab allowed hai)
function originIsAllowed(origin: string) {
    return true;
}

// Request handler
wsServer.on('request', (request) => {
    console.log("inside connect");

    if (!originIsAllowed(request.origin)) {
        request.reject();
        console.log(new Date() + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    // ✅ Fixed: Accept connection without specifying protocol
    const connection = request.accept(null, request.origin);
    console.log(new Date() + ' Connection accepted.');

    connection.on('message', (message) => {
        if (message.type === 'utf8') {
            try {
                messageHandler(connection, JSON.parse(message.utf8Data));
            } catch (e) {
                console.error("Invalid JSON or message error:", e);
            }
        }
    });
});

// Message handler function
function messageHandler(ws: connection, message: IncomingMessage) {
    if (message.type === SupportedMessage.JoinRoom) {
        const payload = message.payload;
        userManager.addUser(payload.name, payload.userId, payload.roomId, ws);
    }

    if (message.type === SupportedMessage.SendMessage) {
        const payload = message.payload;
        const user = userManager.getUser(payload.roomId, payload.userId);

        if (!user) {
            console.error("User not found in the db");
            return;
        }

        const chat = store.addChat(payload.userId, user.name, payload.roomId, payload.message);
        if (!chat) return;

        const outgoingPayload: OutgoingMessage = {
            type: OutgoingSupportedMessages.AddChat,
            payload: {
                chatId: chat.id,
                roomId: payload.roomId,
                message: payload.message,
                name: user.name,
                upvotes: 0
            }
        };

        userManager.broadcast(payload.roomId, payload.userId, outgoingPayload);
    }

    if (message.type === SupportedMessage.UpvoteMessage) {
        const payload = message.payload;
        const chat = store.upvote(payload.userId, payload.roomId, payload.chatId);

        if (!chat) return;

        const outgoingPayload: OutgoingMessage = {
            type: OutgoingSupportedMessages.UpdateChat,
            payload: {
                chatId: payload.chatId,
                roomId: payload.roomId,
                upvotes: chat.upvotes.length
            }
        };

        userManager.broadcast(payload.roomId, payload.userId, outgoingPayload);
    }
}
