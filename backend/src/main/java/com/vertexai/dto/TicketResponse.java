package com.vertexai.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TicketResponse {

    @JsonProperty("ticket_id")
    private UUID ticketId;

    @JsonProperty("ticket_url")
    private String ticketUrl;

    @JsonProperty("status")
    private String status;

    @JsonProperty("assigned_owner")
    private String assignedOwner;

    @JsonProperty("sla_deadline")
    private String slaDeadline;
}
