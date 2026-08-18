package com.vertexai.service;

import com.vertexai.dto.LoginRequest;
import com.vertexai.dto.LoginResponse;
import com.vertexai.entity.User;
import com.vertexai.exception.BadRequestException;
import com.vertexai.repository.UserRepository;
import com.vertexai.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;

    public LoginResponse login(LoginRequest request) {
        log.info("Authenticating user: {}", request.getUsername());

        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            request.getUsername(),
                            request.getPassword()
                    )
            );

            User user = userRepository.findByUsername(request.getUsername())
                    .orElseThrow(() -> new BadRequestException("User record not found"));

            String token = jwtTokenProvider.generateToken(user.getUsername(), user.getRole());
            log.info("User {} successfully authenticated with role: {}", user.getUsername(), user.getRole());

            return LoginResponse.builder()
                    .token(token)
                    .username(user.getUsername())
                    .role(user.getRole())
                    .build();

        } catch (AuthenticationException e) {
            log.warn("Authentication failed for user {}: {}", request.getUsername(), e.getMessage());
            throw new BadRequestException("Invalid username or password");
        }
    }
}
