package com.vertexai.repository;

import com.vertexai.entity.RiskTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RiskTicketRepository extends JpaRepository<RiskTicket, UUID> {

    Optional<RiskTicket> findByFinding_FindingId(UUID findingId);

    List<RiskTicket> findByStatus(String status);

    List<RiskTicket> findByAssignedOwner(String assignedOwner);

    boolean existsByFinding_FindingId(UUID findingId);
}
