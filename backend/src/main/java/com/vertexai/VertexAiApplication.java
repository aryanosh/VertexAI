package com.vertexai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class VertexAiApplication {

    public static void main(String[] args) {
        SpringApplication.run(VertexAiApplication.class, args);
    }
}
