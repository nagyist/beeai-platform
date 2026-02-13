# Migrating from k3s to MicroShift

## Executive Summary

This document analyzes how Agent Stack currently uses k3s and provides a detailed migration path to MicroShift. The migration is feasible but requires careful attention to several key differences in installation, configuration, and runtime behavior.

## Current k3s Usage

### Installation Method

**Current Implementation:**
```python
# base_driver.py:200
await self.run_in_vm(
    ["sh", "-c",
     "which k3s || curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 644 --https-listen-port=16443"],
    "Installing Kubernetes",
)
```

k3s is installed using the official installation script with:
- Custom kubeconfig permissions (`--write-kubeconfig-mode 644`)
- Non-standard API server port (`--https-listen-port=16443`)
- Simple single-command installation

### Container Runtime Integration

**Current Implementation:**
The project heavily uses k3s's bundled containerd (accessed via `k3s ctr`):

1. **Image Import** (base_driver.py:76):
   ```python
   await self.run_in_vm(
       ["/bin/sh", "-c", f"k3s ctr images import {guest_path}"],
       f"Importing image(s) into Agent Stack platform",
   )
   ```

2. **Image Pulling** (base_driver.py:289):
   ```python
   await self.run_in_vm(
       ["k3s", "ctr", "image", "pull", image],
       f"Pulling image {image}",
   )
   ```

3. **Image Listing** (base_driver.py:158):
   ```python
   await self.run_in_vm(
       ["k3s", "ctr", "image", "ls"],
       "Listing guest images",
   )
   ```

### Registry Configuration

**Current Implementation** (base_driver.py:170-194):
```python
registry_config = dedent(
    """\
    mirrors:
      "agentstack-registry-svc.default:5001":
        endpoint:
          - "http://localhost:30501"
    configs:
      "agentstack-registry-svc.default:5001":
        tls:
          insecure_skip_verify: true
    """
)

await self.run_in_vm(
    ["sh", "-c",
     f"sudo mkdir -p /etc/rancher/k3s /registry-data && "
     f"echo '{registry_config}' | "
     "sudo tee /etc/rancher/k3s/registries.yaml > /dev/null"],
    "Configuring Kubernetes registry",
)
```

k3s uses a simple YAML file at `/etc/rancher/k3s/registries.yaml` for configuring:
- Registry mirrors
- Insecure registries
- TLS configuration

### Kubeconfig Management

**Current Implementation** (base_driver.py:298-302):
```python
await self.run_in_vm(
    ["/bin/cat", "/etc/rancher/k3s/k3s.yaml"],
    "Copying kubeconfig from Agent Stack platform",
)
```

- Kubeconfig location: `/etc/rancher/k3s/k3s.yaml`
- Automatically generated and maintained by k3s
- Permissions controlled via installation flag

### kubectl Integration

**Current Implementation:**
All kubectl commands are executed via the `k3s kubectl` wrapper:
- `k3s kubectl apply -f -` (base_driver.py:92)
- `k3s kubectl wait --for=condition=complete` (base_driver.py:135)
- `k3s kubectl get pods -o json --all-namespaces` (base_driver.py:330)
- `k3s kubectl delete pod` (base_driver.py:345)
- With explicit kubeconfig: `--kubeconfig=/etc/rancher/k3s/k3s.yaml` (base_driver.py:316, wsl_driver.py:171)

### Platform-Specific Implementations

#### WSL-Specific Features (wsl_driver.py)
- Systemd-based port forwarding for LoadBalancer services
- CoreDNS custom configuration for host.docker.internal resolution
- Dynamic service port forwarding via systemd units

## MicroShift Architecture

MicroShift is Red Hat's lightweight Kubernetes distribution optimized for edge computing. Key characteristics:

- **Based on OpenShift**: Uses OpenShift components in a minimal footprint
- **CRI-O Runtime**: Uses CRI-O instead of containerd
- **Systemd Integration**: Deep systemd integration for service management
- **Package Distribution**: Primarily distributed as RPM packages (Red Hat/Fedora), with community DEB packages available via microshift.io
- **Edge-optimized**: Designed for resource-constrained environments
- **No Built-in LoadBalancer**: Unlike k3s which includes servicelb/klipper-lb, MicroShift does not provide LoadBalancer service type support

## Feature Comparison Matrix

| Feature | k3s | MicroShift | Migration Impact |
|---------|-----|------------|------------------|
| **Installation** | Single shell script | DEB packages (Ubuntu) | **HIGH** - Requires complete rewrite |
| **Container Runtime** | containerd (k3s ctr) | CRI-O (crictl) | **HIGH** - All ctr commands need replacement |
| **kubectl Access** | `k3s kubectl` | standalone `kubectl` | **MEDIUM** - Different command structure |
| **Kubeconfig Location** | `/etc/rancher/k3s/k3s.yaml` | `/var/lib/microshift/resources/kubeadmin/kubeconfig` | **MEDIUM** - Path changes |
| **Registry Config** | `/etc/rancher/k3s/registries.yaml` | `/etc/containers/registries.conf` | **HIGH** - Different format and location |
| **API Server Port** | 16443 (custom) | 6443 (default), configurable to 16443 | **LOW** - Keep 16443 via config |
| **LoadBalancer Services** | Built-in (servicelb/klipper-lb) | Not included | **HIGH** - Must switch to NodePort |
| **Service Management** | systemd (k3s service) | systemd (microshift service) | **LOW** - Similar pattern |
| **Minimum Resources** | ~512MB RAM | ~2GB RAM | **MEDIUM** - Need to adjust VM memory |

## Detailed Migration Plan

### 1. Installation Changes

**Required Changes:**

Replace the k3s installation script with MicroShift DEB package installation. We'll continue using Ubuntu 24.04 as the base image (for WSL compatibility) and install MicroShift using the community DEB packages from microshift.io.

```python
# Proposed implementation
async def install_microshift(self):
    # Install MicroShift from microshift.io DEB repository
    await self.run_in_vm(
        ["sh", "-c",
         "curl -fsSL https://microshift.io/install.sh | sudo bash"],
        "Adding MicroShift repository",
    )

    await self.run_in_vm(
        ["apt-get", "update"],
        "Updating package lists",
    )

    await self.run_in_vm(
        ["apt-get", "install", "-y", "microshift"],
        "Installing MicroShift",
    )

    # Configure MicroShift to use port 16443
    await self.run_in_vm(
        ["sh", "-c",
         "sudo mkdir -p /etc/microshift && "
         "echo 'apiServer:\n  port: 16443' | sudo tee /etc/microshift/config.yaml"],
        "Configuring MicroShift API server port",
    )

    # Enable and start the service
    await self.run_in_vm(
        ["systemctl", "enable", "--now", "microshift"],
        "Starting MicroShift",
    )

    # Wait for MicroShift to be ready
    await self.run_in_vm(
        ["sh", "-c",
         "until test -f /var/lib/microshift/resources/kubeadmin/kubeconfig; do sleep 2; done"],
        "Waiting for MicroShift to initialize",
    )
```

**Key Points:**
- Uses Ubuntu 24.04 (current base image)
- Installs from microshift.io DEB packages for Ubuntu compatibility
- Configures API server on port 16443 to maintain consistency with current setup
- Follows similar systemd service pattern as k3s

### 2. Container Runtime Changes

**Critical Change:** Replace all `k3s ctr` commands with `crictl` commands.

#### Image Import
**Current (k3s):**
```python
await self.run_in_vm(
    ["/bin/sh", "-c", f"k3s ctr images import {guest_path}"],
    f"Importing image(s) into Agent Stack platform",
)
```

**Proposed (MicroShift):**
```python
# MicroShift uses CRI-O, which expects tar archives
await self.run_in_vm(
    ["/bin/sh", "-c", f"crictl load -i {guest_path}"],
    f"Importing image(s) into Agent Stack platform",
)
```

**Note:** `crictl load` requires proper CRI-O socket configuration:
```python
# Set CRI-O runtime endpoint
env = {"CRI_RUNTIME_ENDPOINT": "unix:///var/run/crio/crio.sock"}
```

#### Image Pulling
**Current (k3s):**
```python
await self.run_in_vm(
    ["k3s", "ctr", "image", "pull", image],
    f"Pulling image {image}",
)
```

**Proposed (MicroShift):**
```python
await self.run_in_vm(
    ["crictl", "pull", image],
    f"Pulling image {image}",
    env={"CRI_RUNTIME_ENDPOINT": "unix:///var/run/crio/crio.sock"}
)
```

#### Image Listing
**Current (k3s):**
```python
await self.run_in_vm(
    ["k3s", "ctr", "image", "ls"],
    "Listing guest images",
)
```

**Proposed (MicroShift):**
```python
await self.run_in_vm(
    ["crictl", "images"],
    "Listing guest images",
    env={"CRI_RUNTIME_ENDPOINT": "unix:///var/run/crio/crio.sock"}
)
```

**Important Differences:**
- crictl output format differs from `ctr image ls`
- Need to update parsing logic in `_grab_image_shas()` method
- crictl uses different column ordering and formats

### 3. Registry Configuration Changes

**Critical Change:** MicroShift uses `/etc/containers/registries.conf` instead of k3s's registries.yaml.

**Current (k3s):**
```yaml
mirrors:
  "agentstack-registry-svc.default:5001":
    endpoint:
      - "http://localhost:30501"
configs:
  "agentstack-registry-svc.default:5001":
    tls:
      insecure_skip_verify: true
```

**Proposed (MicroShift) - registries.conf format:**
```toml
[[registry]]
location = "agentstack-registry-svc.default:5001"
insecure = true

[[registry.mirror]]
location = "localhost:30501"
insecure = true
```

**Implementation:**
```python
async def configure_microshift_registry(self):
    registry_config = dedent(
        """\
        [[registry]]
        location = "agentstack-registry-svc.default:5001"
        insecure = true

        [[registry.mirror]]
        location = "localhost:30501"
        insecure = true
        """
    )

    await self.run_in_vm(
        ["sh", "-c",
         f"sudo mkdir -p /etc/containers && "
         f"echo '{registry_config}' | "
         "sudo tee -a /etc/containers/registries.conf > /dev/null"],
        "Configuring Kubernetes registry",
    )

    # Restart CRI-O to pick up changes
    await self.run_in_vm(
        ["systemctl", "restart", "crio"],
        "Restarting CRI-O",
    )
```

### 4. Kubeconfig Path Changes

**Current (k3s):**
```python
kubeconfig_path = "/etc/rancher/k3s/k3s.yaml"
```

**Proposed (MicroShift):**
```python
kubeconfig_path = "/var/lib/microshift/resources/kubeadmin/kubeconfig"
```

**Required Code Changes:**
1. Update base_driver.py:298 to use new path
2. Update base_driver.py:316 (helm --kubeconfig flag)
3. Update wsl_driver.py:171 (systemd ExecStart)
4. Update any documentation or configuration references

**Permission Handling:**
MicroShift's kubeconfig has different default permissions. May need:
```python
await self.run_in_vm(
    ["chmod", "644", "/var/lib/microshift/resources/kubeadmin/kubeconfig"],
    "Adjusting kubeconfig permissions",
)
```

### 5. kubectl Command Changes

**Current Approach:**
All kubectl commands use the `k3s kubectl` wrapper, which automatically knows about k3s's configuration.

**Migration Approach:**
MicroShift doesn't bundle kubectl, so we need to install standalone kubectl and update all command invocations.

**kubectl Installation:**
```python
async def install_kubectl(self):
    # Detect architecture
    arch_map = {"x86_64": "amd64", "aarch64": "arm64"}
    arch = (await self.run_in_vm(["uname", "-m"], "Detecting architecture")).stdout.decode().strip()
    kubectl_arch = arch_map.get(arch, "amd64")

    await self.run_in_vm(
        ["sh", "-c",
         f"curl -LO https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/{kubectl_arch}/kubectl && "
         "install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && "
         "rm kubectl"],
        "Installing kubectl",
    )
```

**Command Updates Required:**
Replace all instances of `k3s kubectl` with `kubectl`, always specifying kubeconfig explicitly:

```python
# Before
["k3s", "kubectl", "apply", "-f", "-"]

# After (with explicit kubeconfig flag)
["kubectl", "--kubeconfig=/var/lib/microshift/resources/kubeadmin/kubeconfig",
 "apply", "-f", "-"]
```

**Locations requiring updates:**
- base_driver.py:92 - `kubectl apply`
- base_driver.py:135 - `kubectl wait`
- base_driver.py:330 - `kubectl get pods`
- base_driver.py:345 - `kubectl delete pod`
- base_driver.py:316 - helm with kubeconfig
- wsl_driver.py:147 - `kubectl apply`
- wsl_driver.py:171 - systemd port-forward service
- wsl_driver.py:182 - `kubectl get svc`

### 6. API Server Port Configuration

**Current:** k3s runs on port 16443
**MicroShift Default:** port 6443
**Migration Decision:** Keep port 16443

**Rationale:**
Maintaining port 16443 minimizes changes to existing configurations and avoids potential conflicts with other services that might be using the standard Kubernetes port 6443.

**Implementation:**
MicroShift configuration is set during installation (see section 1) via `/etc/microshift/config.yaml`:
```yaml
apiServer:
  port: 16443
```

**No Code Changes Required:**
Since we're keeping the same port, no changes to port references are needed in the codebase.

### 7. Memory and Resource Requirements

**Current k3s VM allocation:**
```python
vm_memory_gib = round(min(8.0, max(3.0, total_memory_gib / 2)))
```
Minimum: 3 GB, Maximum: 8 GB

**MicroShift Requirements:**
- Minimum: 2 GB RAM (bare minimum)
- Recommended: 4 GB RAM for production workloads
- MicroShift has higher overhead than k3s

**Proposed Adjustment:**
```python
# Update lima_driver.py memory allocation
vm_memory_gib = round(min(8.0, max(4.0, total_memory_gib / 2)))  # Minimum 4GB
```

**Update memory check:**
```python
if total_memory_gib < 6:
    console.error("Not enough memory. MicroShift requires at least 6 GB of RAM (4GB for VM).")
    sys.exit(1)

if total_memory_gib < 10:
    console.warning("Less than 10 GB of RAM detected. Performance may be degraded.")
```

### 8. Helm Integration

**Current:** Works seamlessly with k3s kubectl
**MicroShift:** Should work identically with standalone kubectl

**Minimal Changes Required:**
```python
# Update helm commands to use explicit kubeconfig
await self.run_in_vm(
    [
        "helm",
        "upgrade",
        "--install",
        "agentstack",
        "/tmp/agentstack/chart.tgz",
        "--namespace=default",
        "--create-namespace",
        "--values=/tmp/agentstack/values.yaml",
        "--timeout=20m",
        "--wait",
        "--kubeconfig=/var/lib/microshift/resources/kubeadmin/kubeconfig",  # Updated
        *(f"--set={value}" for value in set_values_list),
    ],
    "Deploying Agent Stack platform with Helm",
)
```

### 9. LoadBalancer Service Type Migration

**Critical Issue:**

k3s includes a built-in LoadBalancer implementation called **servicelb** (also known as klipper-lb) that automatically provisions LoadBalancer services on bare metal and VM environments. This is a k3s-specific extension.

**Current Implementation:**
The Agent Stack platform uses LoadBalancer service types extensively (base_driver.py:225):
```python
values = {
    **{svc: {"service": {"type": "LoadBalancer"}} for svc in ["collector", "docling", "ui", "phoenix"]},
    "service": {"type": "LoadBalancer"},
    # ...
    "keycloak": {
        # ...
        "service": {"type": "LoadBalancer"},
    },
}
```

These services expose arbitrary ports (e.g., 8333, 5001) directly on the VM's localhost interface.

**MicroShift Limitation:**
MicroShift does NOT include a LoadBalancer controller. LoadBalancer services will remain in "Pending" state indefinitely without an external load balancer provider.

**Migration Options:**

#### Option A: Switch to NodePort Services (Recommended)

Replace all `type: LoadBalancer` with `type: NodePort`. However, NodePort has limitations:

**NodePort Port Range:** 30000-32767 (by default)

**Current Services and Their Ports:**
- agentstack-server: 8333
- agentstack-registry: 5001, 30501
- keycloak: varies
- ui, collector, docling, phoenix: various ports

**Implementation Changes Required:**

1. **Update Helm Values** (base_driver.py:225):
```python
values = {
    **{svc: {"service": {"type": "NodePort", "nodePorts": {
        # Map internal port to NodePort range
    }}} for svc in ["collector", "docling", "ui", "phoenix"]},
    "service": {"type": "NodePort"},
    # ...
}
```

2. **Update Lima Port Forwarding** (lima_driver.py:126-134):
Since NodePorts are in the 30000-32767 range, update the Lima VM configuration to forward this range:
```yaml
portForwards:
  - guestIP: "127.0.0.1"
    guestPortRange: [30000, 32767]
    hostPortRange: [30000, 32767]
    hostIP: "127.0.0.1"
  # Add explicit mappings for non-NodePort range services
  - guestPort: 30500  # NodePort for service originally on 8333
    hostPort: 8333
  - guestPort: 30501  # NodePort for registry
    hostPort: 5001
```

3. **Update WSL Port Forwarding** (wsl_driver.py:180-198):
The systemd port-forward services need to map NodePort to expected ports:
```python
# Current approach reads LoadBalancer port directly
# New approach needs to:
# 1. Get NodePort from service
# 2. Forward NodePort to expected port

# Example for registry:
# If registry service uses NodePort 30501 internally
# Forward to localhost:5001 for compatibility
```

**Mapping Strategy:**
```python
# Define port mappings for services
SERVICE_PORT_MAPPINGS = {
    "agentstack-server": {"node_port": 30500, "host_port": 8333},
    "agentstack-registry-svc": {"node_port": 30501, "host_port": 5001},
    "keycloak": {"node_port": 30502, "host_port": 8080},
    # ... additional services
}
```

#### Option B: Install MetalLB (Advanced)

Install MetalLB as a LoadBalancer provider on MicroShift:
```python
async def install_metallb(self):
    # Apply MetalLB manifests
    await self.run_in_vm(
        ["kubectl", "--kubeconfig=/var/lib/microshift/resources/kubeadmin/kubeconfig",
         "apply", "-f", "https://raw.githubusercontent.com/metallb/metallb/v0.14.0/config/manifests/metallb-native.yaml"],
        "Installing MetalLB",
    )

    # Configure MetalLB IP address pool
    # Note: This requires available IP addresses on the VM network
```

**Challenges with MetalLB:**
- Requires IP address management
- More complex networking configuration
- May not work well with Lima/WSL NAT networking

**Recommended Approach:**

Use **Option A (NodePort)** with the following implementation:

1. Update Helm chart values to use NodePort
2. Add NodePort specifications for each service (30500-30510 range)
3. Update Lima VM config to forward NodePort range to host
4. Update WSL systemd units to map NodePorts to expected host ports
5. Maintain backward compatibility by mapping NodePorts to original port numbers on the host

**Code Changes Required:**

```python
# wsl_driver.py - Updated port forwarding
async def setup_port_forwarding(self):
    # Get services and their NodePorts
    services_json = (
        await self.run_in_vm(
            ["kubectl", "--kubeconfig=/var/lib/microshift/resources/kubeadmin/kubeconfig",
             "get", "svc", "--field-selector=spec.type=NodePort", "--output=json"],
            "Detecting ports to forward",
        )
    ).stdout

    for service in parse_services(services_json):
        name = service["metadata"]["name"]
        for port_item in service["spec"]["ports"]:
            node_port = port_item.get("nodePort")
            target_port = port_item["port"]

            # Forward NodePort to expected host port
            await self.run_in_vm(
                ["systemctl", "enable", "--now",
                 f"kubectl-port-forward@{name}:{node_port}:{target_port}.service"],
                f"Starting port-forward for {name}:{target_port} (NodePort: {node_port})",
            )
```

### 10. WSL-Specific Considerations

**Current WSL Port Forwarding:**
Uses systemd unit with `k3s kubectl port-forward`

**Required Changes:**
```python
# Update systemd unit in wsl_driver.py:162
await self.run_in_vm(
    ["sh", "-c", "cat >/etc/systemd/system/kubectl-port-forward@.service"],
    "Installing systemd unit for port-forwarding",
    input=textwrap.dedent("""\
    [Unit]
    Description=Kubectl Port Forward for service %i
    After=network.target

    [Service]
    Type=simple
    ExecStart=/bin/bash -c 'IFS=":" read svc node_port host_port <<< "%i"; exec /usr/local/bin/kubectl --kubeconfig=/var/lib/microshift/resources/kubeadmin/kubeconfig port-forward --address=127.0.0.1 svc/$svc $host_port:$node_port'
    Restart=on-failure
    User=root

    [Install]
    WantedBy=multi-user.target
    """).encode(),
)
```

## Implementation Strategy

### Phase 1: Preparation
1. Create feature flag to toggle between k3s and MicroShift
2. Add base class abstraction for Kubernetes distribution
3. Set up test environment with MicroShift

### Phase 2: Core Changes
1. Implement MicroShift installation logic with DEB packages
2. Add kubectl installation step
3. Configure API server port to 16443
4. Replace container runtime commands (ctr → crictl)
5. Update registry configuration
6. Update kubeconfig paths

### Phase 3: Integration
1. Update kubectl command execution across all files
2. Migrate LoadBalancer services to NodePort
3. Implement NodePort to host port mapping for Lima
4. Update WSL port forwarding with NodePort support
5. Adjust memory allocations
6. Update helm integration

### Phase 4: Testing & Validation
1. End-to-end testing on all platforms (Lima, WSL)
2. Image import/export validation
3. Registry functionality verification
4. Performance benchmarking

### Phase 5: Documentation & Rollout
1. Update user documentation
2. Create migration guide for existing users
3. Gradual rollout with opt-in flag
4. Monitor feedback and issues

## Code Structure Proposal

```python
# New file: kubernetes_distribution.py
from abc import ABC, abstractmethod

class KubernetesDistribution(ABC):
    @abstractmethod
    async def install(self, driver: BaseDriver) -> None:
        """Install the Kubernetes distribution"""
        pass

    @abstractmethod
    async def configure_registry(self, driver: BaseDriver, config: dict) -> None:
        """Configure container registry"""
        pass

    @abstractmethod
    async def import_image(self, driver: BaseDriver, image_path: str) -> None:
        """Import container image"""
        pass

    @abstractmethod
    async def pull_image(self, driver: BaseDriver, image: str) -> None:
        """Pull container image"""
        pass

    @abstractmethod
    async def list_images(self, driver: BaseDriver) -> list[str]:
        """List container images"""
        pass

    @abstractmethod
    def get_kubeconfig_path(self) -> str:
        """Get path to kubeconfig file"""
        pass

    @abstractmethod
    async def kubectl_command(self, *args: str) -> list[str]:
        """Build kubectl command with proper context"""
        pass

class K3sDistribution(KubernetesDistribution):
    """Current k3s implementation"""
    # Existing logic extracted here
    pass

class MicroShiftDistribution(KubernetesDistribution):
    """New MicroShift implementation"""
    # New logic implemented here
    pass
```

## Risks and Mitigation

### High Risk Areas

1. **LoadBalancer Service Type**
   - **Risk:** Loss of LoadBalancer functionality; all services must migrate to NodePort
   - **Impact:** Port remapping complexity, potential breakage of existing deployments
   - **Mitigation:** Careful port mapping strategy, comprehensive testing of all service endpoints, maintain port compatibility layer

2. **Container Runtime Compatibility**
   - **Risk:** CRI-O behavior differs from containerd
   - **Mitigation:** Extensive testing of image import/export workflows

3. **Distribution Support**
   - **Risk:** MicroShift DEB packages from microshift.io may have different support levels than official packages
   - **Mitigation:** Test thoroughly on Ubuntu 24.04, monitor microshift.io package updates, have fallback plan

4. **Resource Overhead**
   - **Risk:** MicroShift requires more memory than k3s
   - **Mitigation:** Adjust VM sizing and update system requirements

5. **Breaking Changes for Users**
   - **Risk:** Existing deployments may fail after migration
   - **Mitigation:** Provide migration tool and maintain k3s support during transition

### Medium Risk Areas

1. **Registry Configuration**
   - **Risk:** Different configuration format may cause registry issues
   - **Mitigation:** Automated configuration validation

2. **Systemd Integration**
   - **Risk:** Different service startup behavior
   - **Mitigation:** Comprehensive systemd unit testing

## Testing Checklist

- [ ] MicroShift installation from microshift.io DEB packages on Ubuntu 24.04
- [ ] API server running on port 16443
- [ ] kubectl installation and functionality
- [ ] Image import from Docker using crictl
- [ ] Image pull directly into MicroShift using crictl
- [ ] Registry mirror configuration via /etc/containers/registries.conf
- [ ] Insecure registry support
- [ ] Helm chart deployment with updated kubeconfig paths
- [ ] NodePort service creation and accessibility
- [ ] Port mapping from NodePort range to expected ports on Lima
- [ ] Port forwarding on WSL with NodePort services
- [ ] Systemd kubectl port-forward units on WSL
- [ ] CoreDNS custom configuration
- [ ] Kubeconfig export and usage from /var/lib/microshift/resources/kubeadmin/kubeconfig
- [ ] Memory allocation and performance (4GB minimum)
- [ ] Multi-platform testing (Lima on macOS, WSL on Windows)
- [ ] End-to-end service connectivity through remapped ports
- [ ] Agent Stack server accessibility on localhost:8333
- [ ] Registry accessibility on localhost:5001

## Timeline Estimate

- **Phase 1 (Preparation):** 1 week
- **Phase 2 (Core Changes):** 2-3 weeks
- **Phase 3 (Integration):** 3-4 weeks (includes LoadBalancer → NodePort migration)
- **Phase 4 (Testing):** 3-4 weeks (includes extensive port forwarding testing)
- **Phase 5 (Documentation & Rollout):** 1-2 weeks

**Total Estimated Duration:** 10-14 weeks

**Note:** The timeline increased primarily due to the LoadBalancer to NodePort migration complexity, which requires careful port mapping and testing across both Lima and WSL platforms.

## Recommendation

The migration from k3s to MicroShift is **technically feasible** but involves **significant effort** across multiple subsystems. Key considerations:

**Advantages of Migration:**
- Red Hat enterprise support and ecosystem
- Better alignment with OpenShift for enterprise deployments
- Stronger security posture (SELinux integration)
- Better suited for edge computing scenarios

**Disadvantages:**
- Higher resource requirements (4GB vs 3GB minimum)
- More complex installation process
- Loss of built-in LoadBalancer support (requires NodePort migration)
- Port remapping complexity for Lima and WSL
- Breaking changes for existing users
- 3-4 months of development effort
- Dependency on community DEB packages from microshift.io

**Alternative Recommendation:**
Consider whether the benefits of MicroShift specifically align with Agent Stack's target use cases. If the primary requirement is "lightweight Kubernetes," k3s is already an excellent choice.

**Key Migration Challenges:**
1. **LoadBalancer Loss:** The most significant challenge is losing k3s's built-in LoadBalancer (servicelb). All services must migrate to NodePort, requiring complex port remapping across Lima VM configuration and WSL systemd units.
2. **Port Management:** NodePort's limited range (30000-32767) means services can't expose arbitrary ports directly, requiring a port mapping layer.
3. **Community Packages:** Reliance on microshift.io DEB packages introduces dependency on community maintenance.

**MicroShift is better suited when:**
- OpenShift compatibility is explicitly required
- Red Hat enterprise support is needed
- Edge computing with Red Hat ecosystem is the target platform
- SELinux integration is a hard requirement

If these don't apply, **continuing with k3s** may be the most pragmatic choice given the significant engineering effort (3-4 months) and architectural complexity introduced by the LoadBalancer migration.
