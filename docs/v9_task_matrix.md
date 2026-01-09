# LawClick V9.0 Implementation Task Matrix (Titan List - Expanded)

**Vision Document**: [v9_vision_floating_ecosystem.md](file:///d:/Desktop/LawClick_NEW/docs/v9_vision_floating_ecosystem.md)
**Unified Requirements**: [unified_requirements.md](file:///d:/Desktop/LawClick_NEW/docs/unified_requirements.md)

---

## 🛑 Phase 0: Prerequisite & Safety
- [ ] **Backup**: Git commit current state.
- [ ] **Config Check**: Verify Tailwind/Globals loading.
- [ ] **Lint Clean**: Maintain zero errors.

---

## 🎨 Phase 1: Visual Renaissance (Rationalism UI)
**Objective**: "High-Density Professional Aesthetic".

### 1.1 Foundation
- [ ] **Typography**: Implement `Inter` + `PingFang SC`.
- [ ] **Tokens**: Apply `globals.css` new variables (Orange as Primary, Frosted Glass tokens).
- [ ] **Layout**: Refactor `app-sidebar.tsx` and `header.tsx` to Glassmorphism style.

### 1.2 Component Refactoring
- [ ] **Buttons**: Rational style (sharp/micro-rounded).
- [ ] **Cards**: High-performance Frosted Glass.
- [ ] **Inputs/Forms**: Professional styling (remove generic outlines).

---

## 🧩 Phase 2: The Floating Ecosystem ("Levitation")
**Objective**: Tools travel with the lawyer.

### 2.1 Architecture
- [ ] **FloatingLayer**: Global Z-Index Manager & Portal Root.
- [ ] **Store**: `useFloatingStore` (Coordinates, Size, Dock State).

### 2.2 Components
- [ ] **Capsule Timer**: Redesign as detachable floating capsule.
    - [ ] Draggable Logic.
    - [ ] **Picture-in-Picture (PiP)** R&D.
- [ ] **Floating Chat**: Detachable "Anywhere" communication.

---

## 🧠 Phase 3: Status Network & Smart Dispatch
**Objective**: Status-aware collaboration and assignment.

### 3.1 Status Logic (The Brain)
- [ ] **Auto-Status**: Logic to drive Busy/Free based on Timer/Calendar/Mouse.
- [ ] **Avatar Indicators**: Red/Yellow/Green rings in UI.
- [ ] **Context Tooltips**: Hover avatar -> "Drafting: [Case Name] (2h)".

### 3.2 Smart Dispatch (Task Allocation)
- [ ] **Team Heatmap UI**: Visual grid showing everyone's current load & status.
- [ ] **Drag-to-Assign**: Drag task card onto a User.
- [ ] **Smart Intervention**: If assigning to "Busy" user -> Prompt: "User is deep working. Queue for later?"

---

## 📚 Phase 4: The Knowledge Engine (Institutional Memory)
**Objective**: Reuse knowledge, don't reinvent it.

### 4.1 Vector Architecture
- [ ] **DB Setup**: Install/Mock `pgvector` or connect external Vector Store.
- [ ] **Indexing Pipeline**: Logic to chunk Case Memos/Contracts -> Embeddings.

### 4.2 AI Paralegal (RAG)
- [ ] **Simulated RAG**: Sidebar shows "Similar Cases" based on current keywords.
- [ ] **Document Suggest**: "We found 3 similar contracts from 2024".

---

## ⚙️ Phase 5: Technical Completeness (The Architect)
**Objective**: Solid backend backbone.

- [ ] **Async Queue**: Setup `BullMQ` (or mock interface) for background jobs.
- [ ] **Full Text Search**: Implement robust file/case search (not just `contains`).
- [ ] **RBAC Security**: Implement `casl` or policy-based permission guards (beyond simple Roles).

---

## 🚪 Phase 6: Portals & Deep Work
- [ ] **CX Radar**: Partner Dashboard for Client Experience.
- [ ] **Deep Doc Review**: PDF Annotation Layer.
