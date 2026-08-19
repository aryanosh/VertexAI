package com.vertexai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ControlActionRequest {

    @NotBlank(message = "Action is required")
    @Pattern(regexp = "^(CONTINUE|STOP)$", message = "Action must be either CONTINUE or STOP")
    private String action;
}
