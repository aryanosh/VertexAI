package com.vertexai.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Enable simple in-memory message broker on destination prefix /topic
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // STOMP endpoint (SockJS) moved to /ws/stomp; the raw JSON WebSocket used by
        // the Next.js dashboard is served at /ws/pipeline (see RawWebSocketConfig).
        registry.addEndpoint("/ws/stomp")
                .setAllowedOrigins("http://localhost:3000", "http://127.0.0.1:3000")
                .withSockJS();
    }
}
