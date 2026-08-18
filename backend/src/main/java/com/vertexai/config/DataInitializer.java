package com.vertexai.config;

import com.vertexai.entity.User;
import com.vertexai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        seedUserIfNotExists("admin", "admin@vertexai.local", "admin123", "ADMIN");
        seedUserIfNotExists("analyst", "analyst@vertexai.local", "analyst123", "ANALYST");
        seedUserIfNotExists("viewer", "viewer@vertexai.local", "viewer123", "VIEWER");
    }

    private void seedUserIfNotExists(String username, String email, String rawPassword, String role) {
        userRepository.findByUsername(username).ifPresentOrElse(
                user -> {
                    // Update password hash to guarantee BCrypt matches current encoder
                    user.setPasswordHash(passwordEncoder.encode(rawPassword));
                    userRepository.save(user);
                    log.info("Updated password hash for seed user: {}", username);
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
