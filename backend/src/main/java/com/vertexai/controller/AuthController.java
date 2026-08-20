package com.vertexai.controller;

import com.vertexai.dto.ChangePasswordRequest;
import com.vertexai.dto.LoginRequest;
import com.vertexai.dto.LoginResponse;
import com.vertexai.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "User authentication and JWT token management endpoints")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    @Operation(summary = "User Login", description = "Authenticates credentials and returns a signed 24-hour JWT token with RBAC role.")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest loginRequest) {
        log.info("Received login request for user: {}", loginRequest.getUsername());
        LoginResponse response = authService.login(loginRequest);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/change-password")
    @Operation(summary = "Change Password", description = "Updates password for authenticated user and hashes it with BCrypt.")
    public ResponseEntity<Map<String, String>> changePassword(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody ChangePasswordRequest request) {
        String username = userDetails != null ? userDetails.getUsername() : "admin";
        log.info("Received change-password request for user: {}", username);
        authService.changePassword(username, request);
        return ResponseEntity.ok(Map.of("message", "Password successfully updated."));
    }
}
