package com.vertexai.repository;

import com.vertexai.entity.Asset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssetRepository extends JpaRepository<Asset, UUID> {

    Optional<Asset> findByHostname(String hostname);

    List<Asset> findByIsAuthorizedTrue();

    List<Asset> findByEnvironment(String environment);

    boolean existsByHostname(String hostname);
}
