package com.vertexai.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TicketApprovalRequest {

    @NotNull(message = "Approval decision (true/false) is required")
    private Boolean approved;
}
