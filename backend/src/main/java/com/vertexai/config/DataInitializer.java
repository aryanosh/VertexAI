package com.vertexai.config;

import com.vertexai.entity.User;
import com.vertexai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.auth.admin-password:admin123}")
    private String adminPassword;

    @Value("${app.auth.analyst-password:analyst123}")
    private String analystPassword;

    @Value("${app.auth.viewer-password:viewer123}")
    private String viewerPassword;

    @Override
    public void run(String... args) {
        seedUserIfNotExists("admin", "admin@vertexai.local", adminPassword, "ADMIN");
        seedUserIfNotExists("analyst", "analyst@vertexai.local", analystPassword, "ANALYST");
        seedUserIfNotExists("viewer", "viewer@vertexai.local", viewerPassword, "VIEWER");
    }

    private void seedUserIfNotExists(String username, String email, String rawPassword, String role) {
        userRepository.findByUsername(username).ifPresentOrElse(
                user -> {
                    // Update password hash to guarantee BCrypt matches current encoder and config
                    user.setPasswordHash(passwordEncoder.encode(rawPassword));
                    userRepository.save(user);
                    log.info("Updated BCrypt password hash for seed user: {}", username);
                },
                () -> {
                    User newUser = User.builder()
                            .username(username)
                            .email(email)
                            .passwordHash(passwordEncoder.encode(rawPassword))
                            .role(role)
                            .build();
                    userRepository.save(newUser);
                    log.info("Created seed user: {} with role: {}", username, role);
                }
        );
    }
}
