import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { WebGLRenderer } from 'three';
import { useAppStore } from '../../store';
import { ContainerShell } from './ContainerShell';
import { TruckDecoration } from './TruckDecoration';
import { TRUCK_LENGTH_MM, containerWallThickness, vehicleGroundClearance } from './containerGeometry';
import { CargoBox3D } from './CargoBox3D';
import { DraggablePlacement } from './DraggablePlacement';
import { CameraToolbar, type CameraPreset } from './CameraToolbar';
import { CenterOfGravityMarker } from './CenterOfGravityMarker';
import { DraggableStatsBar } from './DraggableStatsBar';
import { StepSimulationControls } from './StepSimulationControls';
import { clampStepIndex, getVisiblePlacements } from './stepSimulation';
import { SceneCornerCluster } from './SceneCornerCluster';
import { ContainerTabsBar } from './ContainerTabsBar';
import { downloadPackingSolutionPdf, type ContainerReportInput } from '../../export/exportPdf';

// Đợi vài animation frame sau khi đổi activeContainerInstanceId (store) trước khi chụp canvas —
// cần thời gian để React commit lại danh sách placements mới VÀ Three.js render lại đúng khung
// hình đó (Canvas frameloop mặc định "always" tự vẽ lại mỗi frame, nhưng vẫn cần chờ ít nhất
// 1-2 frame để mesh mới kịp lên khung hình trước khi renderer.domElement.toDataURL() đọc buffer).
function waitAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

// Highlight "vừa thêm vào" tự tắt sau chừng này (ms) — xem CargoBox3D.tsx `highlighted`.
const HIGHLIGHT_DURATION_MS = 1600;
// Thông báo lỗi chỉnh tay (move/rotate/swap bị từ chối) tự tắt sau chừng này (ms).
const EDIT_NOTICE_DURATION_MS = 3000;

/**
 * Khoảng cách camera tính theo sceneMaxDim (đã bao gồm chiều dài đầu xe) chứ không chỉ theo
 * kích thước container, để mọi preset đều lùi ra đủ xa thấy trọn cả xe.
 *
 * `sceneCenterX` phải là tâm của TOÀN CẢNH (container + đầu xe), không phải tâm riêng
 * container — nếu không, camera/target sẽ lệch về phía cửa container và đầu xe (nằm lệch hẳn
 * về phía dương x) sẽ bị đẩy ra ngoài khung nhìn, bị cắt ở mép phải.
 *
 * Isometric và Side đều đứng ở PHÍA CỬA / phía hông (x nhỏ hoặc nhìn ngang theo trục z) —
 * không bao giờ đứng ngoài mũi xe nhìn ngược lại — nên đầu xe (nằm ở đầu x=length) luôn ở xa
 * phía sau container, không thể che hàng bên trong.
 */
function cameraPositionFor(
  preset: CameraPreset,
  sceneCenterX: number,
  width: number,
  verticalCenterY: number,
  sceneMaxDim: number,
): [number, number, number] {
  switch (preset) {
    case 'TOP':
      return [sceneCenterX, sceneMaxDim * 1.6, width / 2];
    case 'SIDE':
      return [sceneCenterX, verticalCenterY, width / 2 + sceneMaxDim * 1.3];
    case 'ISOMETRIC':
    default:
      return [sceneCenterX - sceneMaxDim * 0.95, sceneMaxDim * 0.75, width / 2 + sceneMaxDim * 0.95];
  }
}

export function ContainerScene() {
  const solution = useAppStore((s) => s.solution);
  const containerLibrary = useAppStore((s) => s.containerLibrary);
  const selectedContainerTemplateId = useAppStore((s) => s.selectedContainerTemplateId);
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);
  const selectedPlacementId = useAppStore((s) => s.ui.selectedPlacementId);
  const selectPlacement = useAppStore((s) => s.selectPlacement);
  const activeContainerInstanceId = useAppStore((s) => s.activeContainerInstanceId);
  const setActiveContainer = useAppStore((s) => s.setActiveContainer);
  const rotateModeActive = useAppStore((s) => s.ui.rotateModeActive);
  const toggleRotateMode = useAppStore((s) => s.toggleRotateMode);
  const setRotateMode = useAppStore((s) => s.setRotateMode);
  const viewMode = useAppStore((s) => s.ui.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const currentStepIndex = useAppStore((s) => s.currentStepIndex);
  const setCurrentStepIndex = useAppStore((s) => s.setCurrentStepIndex);
  const movePlacement = useAppStore((s) => s.movePlacement);
  const rotatePlacement = useAppStore((s) => s.rotatePlacement);
  const swapPlacements = useAppStore((s) => s.swapPlacements);
  const editNotice = useAppStore((s) => s.editNotice);
  const clearEditNotice = useAppStore((s) => s.clearEditNotice);
  const lastContainerSuggestion = useAppStore((s) => s.lastContainerSuggestion);
  const applyContainerSuggestion = useAppStore((s) => s.applyContainerSuggestion);

  const [preset, setPreset] = useState<CameraPreset>('ISOMETRIC');
  const [highlightedPlacementId, setHighlightedPlacementId] = useState<string | null>(null);
  // Div .scene-container thật — DraggableStatsBar.tsx dùng làm khung tọa độ tham chiếu để kẹp vị
  // trí kéo trong vùng nhìn thấy, và làm nơi portal dải thông tin ra khi đã có vị trí tùy chỉnh.
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  // WebGLRenderer thật của Canvas (gán qua onCreated bên dưới) — dùng để chụp ảnh sơ đồ xếp hàng
  // 3D lúc xuất PDF (renderer.domElement.toDataURL), xem handleExportPdf.
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const isSimulating = viewMode === 'STEP_SIMULATION';
  // Chỉnh tay (kéo/xoay/hoán đổi) chỉ có ý nghĩa khi đang xem TOÀN BỘ phương án, không phải lúc
  // đang xem lại từng bước (visiblePlacements khi đó chỉ là một phần, dễ gây nhầm lẫn).
  const canEdit = !isSimulating;

  // Luôn hiển thị container đang CHỌN trong thư viện (kể cả rỗng, chưa tạo phương án) — đổi
  // lựa chọn phải phản ánh ngay lên khung nhìn 3D. Chỉ hiển thị hàng hóa khi phương án đã tạo
  // thực sự thuộc ĐÚNG container đang chọn; nếu người dùng đổi sang container khác, hàng hóa cũ
  // (thuộc container trước) sẽ ẩn đi để tránh nhầm lẫn kích thước.
  const containerTemplate =
    containerLibrary.find((t) => t.id === selectedContainerTemplateId) ?? containerLibrary[0];
  // solution.containers có thể có NHIỀU container (hàng hóa vượt quá 1 container — xem
  // generateSolutions.ts) — tất cả cùng chung 1 loại template trong 1 solution, nên chỉ cần so
  // template của container ĐẦU TIÊN để biết cả solution có thuộc containerTemplate đang chọn hay
  // không. `container` = đúng container instance đang XEM (activeContainerInstanceId, đổi qua dải
  // tab ContainerTabsBar), tự rơi về container đầu tiên nếu chưa chọn/id không khớp (vd solution
  // vừa được tạo lại).
  const solutionContainers = solution?.containers[0]?.templateId === containerTemplate?.id ? (solution?.containers ?? []) : [];
  const container = solutionContainers.find((c) => c.id === activeContainerInstanceId) ?? solutionContainers[0];
  // Chỉ hiển thị cảnh báo lệch trọng tâm CỦA ĐÚNG container đang xem — cgWarnings là mảng PHẲNG
  // gộp chung mọi container trong solution (xem PackingSolution.cgWarnings), phải tự lọc theo
  // containerInstanceId, không thì cảnh báo của container khác sẽ lẫn vào.
  const cgWarnings = container ? (solution?.cgWarnings ?? []).filter((w) => w.containerInstanceId === container.id) : [];

  // Template DÙNG ĐỂ VẼ/tính stats của container đang xem — tra theo ĐÚNG container.templateId
  // thay vì luôn dùng containerTemplate (template đang CHỌN trong thư viện), vì từ khi có gợi ý
  // đổi xe cho container cuối (applyContainerSuggestion, xem solutionSlice.ts) container CUỐI có
  // thể thuộc 1 template KHÁC hẳn các container còn lại trong cùng solution (vd container 1-2 là
  // 40ft HC, container 3 đã đổi sang xe tải nhỏ) — containerTemplate vẫn giữ nguyên ý nghĩa "đang
  // chọn trong thư viện" cho ContainerPicker/nút "Tạo phương án", KHÔNG đổi theo container đang xem.
  const activeContainerTemplate = container
    ? (containerLibrary.find((t) => t.id === container.templateId) ?? containerTemplate)
    : containerTemplate;
  const lastContainerInSolution = solutionContainers[solutionContainers.length - 1];
  const isViewingLastContainer = !!container && !!lastContainerInSolution && container.id === lastContainerInSolution.id;
  const suggestedTemplateName = lastContainerSuggestion
    ? containerLibrary.find((t) => t.id === lastContainerSuggestion.suggestedTemplateId)?.name
    : undefined;

  const templatesById = useMemo(() => new Map(cargoTemplates.map((t) => [t.id, t])), [cargoTemplates]);

  // Load order = thứ tự CÓ SẴN trong container.placements (packContainer.ts push đúng thứ tự
  // thuật toán quyết định xếp) — không tính lại. total steps = tổng số kiện; stepIndex được
  // clamp phòng trường hợp solution đổi (ít kiện hơn) trong khi đang simulate ở bước cao.
  const totalSteps = container?.placements.length ?? 0;
  const stepIndex = clampStepIndex(currentStepIndex, totalSteps);
  const visiblePlacements = isSimulating
    ? getVisiblePlacements(container?.placements ?? [], stepIndex)
    : (container?.placements ?? []);
  const currentPlacement = stepIndex > 0 ? visiblePlacements[stepIndex - 1] : undefined;

  // Highlight tạm thời kiện vừa "thêm vào" ở bước hiện tại, tự tắt sau HIGHLIGHT_DURATION_MS —
  // reset mỗi khi bước hoặc chế độ simulation đổi để không giữ highlight cũ.
  useEffect(() => {
    if (!isSimulating || !currentPlacement) {
      setHighlightedPlacementId(null);
      return;
    }
    setHighlightedPlacementId(currentPlacement.id);
    const timer = setTimeout(() => setHighlightedPlacementId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isSimulating, currentPlacement]);

  // Phím ← / → điều khiển Previous/Next khi đang simulate — bỏ qua khi người dùng đang gõ vào 1
  // ô nhập liệu (SKU, số lượng...) để không xung đột với thao tác nhập form ở nơi khác trên trang.
  useEffect(() => {
    if (!isSimulating) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'ArrowLeft') {
        setCurrentStepIndex(clampStepIndex(stepIndex - 1, totalSteps));
      } else if (e.key === 'ArrowRight') {
        setCurrentStepIndex(clampStepIndex(stepIndex + 1, totalSteps));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSimulating, stepIndex, totalSteps, setCurrentStepIndex]);

  // Phím R xoay 90° kiện hàng ĐANG CHỌN (chỉ khi có thể chỉnh tay — không phải đang xem từng
  // bước). Cùng cách bỏ qua khi đang gõ vào ô nhập liệu như effect ArrowLeft/ArrowRight ở trên.
  useEffect(() => {
    if (!canEdit || !selectedPlacementId || !container) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'r' || e.key === 'R') {
        rotatePlacement(container.id, selectedPlacementId, 'Y');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, selectedPlacementId, container, rotatePlacement]);

  // Phím Esc thoát "chế độ xoay" (rotateModeActive), quay về chế độ di chuyển mặc định — cùng
  // cách bỏ qua khi đang gõ vào ô nhập liệu như các effect phím tắt khác ở trên.
  useEffect(() => {
    if (!rotateModeActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'Escape') setRotateMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rotateModeActive, setRotateMode]);

  // Thông báo lỗi chỉnh tay tự tắt sau EDIT_NOTICE_DURATION_MS.
  useEffect(() => {
    if (!editNotice) return;
    const timer = setTimeout(() => clearEditNotice(), EDIT_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [editNotice, clearEditNotice]);

  // Giữ Shift rồi bấm kiện thứ 2 (trong khi kiện thứ 1 đang được chọn) = hoán đổi vị trí 2 kiện,
  // thay vì chỉ đổi lựa chọn như click thường.
  const handleSelectPlacement = (placementId: string, shiftKey: boolean) => {
    if (canEdit && shiftKey && selectedPlacementId && selectedPlacementId !== placementId && container) {
      swapPlacements(container.id, selectedPlacementId, placementId);
      selectPlacement(null);
      return;
    }
    selectPlacement(placementId);
  };

  // Xuất PDF: lần lượt xem qua TỪNG container trong solution (đổi activeContainerInstanceId qua
  // store, giống hệt bấm tab ContainerTabsBar) để chụp đúng ảnh 3D của từng container, rồi khôi
  // phục lại container đang xem ban đầu sau khi xong — người dùng không thấy khung nhìn "nhảy"
  // qua lại vì mỗi lần đổi + chụp chỉ mất vài frame.
  const handleExportPdf = async () => {
    if (!solution || !containerTemplate || solutionContainers.length === 0 || isExportingPdf) return;
    const originalActiveId = activeContainerInstanceId;
    setIsExportingPdf(true);
    try {
      const reports: ContainerReportInput[] = [];
      for (const containerInstance of solutionContainers) {
        setActiveContainer(containerInstance.id);
        await waitAnimationFrames(3);
        const imageDataUrl = rendererRef.current?.domElement.toDataURL('image/png');
        reports.push({
          // Template thật của TỪNG container (không phải lúc nào cũng == containerTemplate đang
          // chọn — xem giải thích activeContainerTemplate ở trên: container cuối có thể đã đổi
          // sang loại khác qua applyContainerSuggestion), để báo cáo PDF hiện đúng kích thước/tải
          // trọng của từng container thay vì lặp lại 1 template cho tất cả.
          containerTemplate: containerLibrary.find((t) => t.id === containerInstance.templateId) ?? containerTemplate,
          container: containerInstance,
          cargoTemplatesById: templatesById,
          imageDataUrl,
        });
      }
      await downloadPackingSolutionPdf(reports);
    } finally {
      setActiveContainer(originalActiveId);
      setIsExportingPdf(false);
    }
  };

  if (!containerTemplate) {
    return <div className="scene-empty">Chưa có container nào trong thư viện.</div>;
  }

  // Toàn bộ hình học cảnh (vách/sàn/camera/ánh sáng...) dùng activeContainerTemplate (template
  // THẬT của container đang xem, có thể khác containerTemplate đang chọn trong thư viện — xem giải
  // thích activeContainerTemplate ở trên), để container/xe cuối sau khi đổi qua
  // applyContainerSuggestion hiển thị ĐÚNG kích thước xe mới thay vì khung 3D cũ.
  //
  // maxDim của riêng container (không tính xe) — chỉ dùng để tính độ dày vách/sàn, phải tách
  // biệt với sceneMaxDim (có tính xe) bên dưới dùng cho camera/ánh sáng/bóng đổ.
  const containerMaxDim = Math.max(
    activeContainerTemplate.innerLength,
    activeContainerTemplate.innerWidth,
    activeContainerTemplate.innerHeight,
  );
  const thickness = containerWallThickness(containerMaxDim);
  // Mặt đất thật nằm dưới đáy sàn (-thickness) một khoảng bằng khung gầm + bánh xe — xem
  // containerGeometry.ts. Đáy sàn (-thickness) giữ nguyên không đổi (mốc dùng cho tọa độ hàng
  // hóa), chỉ mặt đất bên dưới hạ xuống để chừa chỗ vẽ bánh/khung gầm.
  const groundY = -thickness - vehicleGroundClearance(activeContainerTemplate.innerHeight);

  const totalLength = activeContainerTemplate.innerLength + thickness + TRUCK_LENGTH_MM;
  const totalHeightSpan =
    activeContainerTemplate.innerHeight + thickness + vehicleGroundClearance(activeContainerTemplate.innerHeight);
  const sceneMaxDim = Math.max(totalLength, activeContainerTemplate.innerWidth, totalHeightSpan);
  // Tâm x của toàn cảnh (container + đầu xe) — dùng chung cho camera VÀ target OrbitControls
  // để hai bên luôn khớp nhau, tránh lệch khung nhìn.
  const sceneCenterX = totalLength / 2;
  // Tâm y của toàn cảnh THEO CHIỀU DỌC, tính từ mặt đất thật (dưới bánh xe) chứ không phải từ
  // đáy sàn container — nếu không, tâm nhìn sẽ lệch lên cao hơn thực tế và dễ cắt mất bánh xe ở
  // mép dưới khung hình, nhất là góc Side.
  const sceneCenterY = (groundY + activeContainerTemplate.innerHeight) / 2;

  const [camX, camY, camZ] = cameraPositionFor(
    preset,
    sceneCenterX,
    activeContainerTemplate.innerWidth,
    sceneCenterY,
    sceneMaxDim,
  );

  // Kích thước cảnh tính bằng mm (hàng nghìn~chục nghìn) vượt xa far mặc định của
  // PerspectiveCamera (2000), phải nới near/far theo kích thước cảnh để không bị clip.
  const far = sceneMaxDim * 10;
  const near = Math.max(1, sceneMaxDim / 1000);

  return (
    <div className="scene-container" ref={sceneContainerRef}>
      {/*
        Bọc chung 1 hàng riêng cho dải tab container (nếu có) + 1 hàng riêng cho
        camera-toolbar/dải thông tin container — xếp CHỒNG DỌC (flex-direction: column) bằng
        flexbox thay vì để các khối tự position:absolute độc lập như trước (từng bị dải tab canh
        giữa đè lên dải thông tin canh phải khi có nhiều container/màn hình hẹp). `.scene-top-chrome`
        và `.scene-top-row` đều pointer-events:none (chỉ là khung xếp hàng, không có nền) để phần
        "khoảng trống" giữa các nút vẫn cho thao tác xoay/kéo camera xuyên qua xuống Canvas bên
        dưới — từng khối con (CameraToolbar/dải thông tin/ContainerTabsBar) tự bật lại
        pointer-events:auto (xem App.css). Dải thông tin (DraggableStatsBar) chỉ nằm Ở ĐÂY khi
        CHƯA từng bị kéo đi nơi khác — một khi đã kéo, nó tự portal ra vị trí tùy chỉnh, độc lập
        hẳn với hàng này (không còn ảnh hưởng gì đến dải tab container ở trên nữa).
      */}
      <div className="scene-top-chrome">
        {solutionContainers.length > 1 && (
          <ContainerTabsBar
            containers={solutionContainers}
            activeContainerId={container?.id}
            onSelectContainer={setActiveContainer}
          />
        )}
        <div className="scene-top-row">
          <CameraToolbar onSelectPreset={setPreset} />
          <DraggableStatsBar
            containerTemplate={activeContainerTemplate}
            container={container}
            cgWarnings={cgWarnings}
            sceneContainerRef={sceneContainerRef}
            canExportPdf={!!solution}
            isExportingPdf={isExportingPdf}
            onExportPdf={handleExportPdf}
            suggestion={isViewingLastContainer ? lastContainerSuggestion : null}
            suggestedTemplateName={suggestedTemplateName}
            onApplySuggestion={applyContainerSuggestion}
          />
        </div>
      </div>
      {/*
        Canvas KHÔNG set <color attach="background"> -> nền WebGL trong suốt, để lộ nền CSS
        (linear-gradient xám sáng) của .scene-container phía sau — cho hiệu ứng chuyển màu nhẹ
        mà không cần vẽ gradient bằng shader.
      */}
      <Canvas
        shadows
        gl={{ alpha: true, preserveDrawingBuffer: true }}
        onCreated={(state) => {
          rendererRef.current = state.gl;
        }}
        onPointerMissed={() => selectPlacement(null)}
      >
        <PerspectiveCamera makeDefault position={[camX, camY, camZ]} fov={50} near={near} far={far} />
        {/*
          makeDefault: đăng ký làm "controls mặc định" của scene (state.controls trong r3f) — nhờ
          vậy khi kéo trực tiếp thân kiện hàng (xem DraggablePlacement.tsx), code kéo tự đọc được
          state.controls và tắt/bật OrbitControls NGAY LẬP TỨC lúc bắt đầu/kết thúc kéo (mutate
          thẳng .enabled, không qua React state vì timing không đáng tin cậy) — nếu không,
          OrbitControls vẫn xoay camera song song với thao tác kéo, làm nhiễu việc kéo kiện hàng.
        */}
        <OrbitControls
          makeDefault
          target={[sceneCenterX, sceneCenterY, activeContainerTemplate.innerWidth / 2]}
        />
        {/* Ánh sáng dịu: hemisphere cho sáng đều nhẹ nhàng + 1 directional nhẹ đổ bóng mềm,
            không dùng ánh sáng gắt như trước. */}
        <hemisphereLight color="#ffffff" groundColor="#c7cad1" intensity={0.9} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[sceneMaxDim * 0.6, sceneMaxDim * 1.4, sceneMaxDim * 1.1]}
          intensity={0.6}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={sceneMaxDim * 4}
          shadow-camera-left={-sceneMaxDim}
          shadow-camera-right={sceneMaxDim}
          shadow-camera-top={sceneMaxDim}
          shadow-camera-bottom={-sceneMaxDim}
        />

        {/* Đổ bóng mềm trên mặt đất, canh giữa cả cụm container + đầu xe */}
        <ContactShadows
          position={[totalLength / 2, groundY, activeContainerTemplate.innerWidth / 2]}
          opacity={0.35}
          scale={sceneMaxDim * 3}
          blur={2.8}
          far={sceneMaxDim}
        />

        <ContainerShell
          length={activeContainerTemplate.innerLength}
          width={activeContainerTemplate.innerWidth}
          height={activeContainerTemplate.innerHeight}
        />
        <TruckDecoration
          length={activeContainerTemplate.innerLength}
          width={activeContainerTemplate.innerWidth}
          height={activeContainerTemplate.innerHeight}
        />
        {visiblePlacements.map((placement) => {
          const isSelected = placement.id === selectedPlacementId;
          // Chỉ kiện ĐANG CHỌN, khi có thể chỉnh tay, mới được bọc DraggablePlacement (kéo trực
          // tiếp thân kiện) — các kiện khác vẽ bình thường, không kéo được.
          if (isSelected && canEdit && container) {
            return (
              <DraggablePlacement
                key={placement.id}
                placement={placement}
                template={templatesById.get(placement.cargoTemplateId)}
                highlighted={placement.id === highlightedPlacementId}
                onSelect={handleSelectPlacement}
                onCommitMove={(target) => movePlacement(container.id, placement.id, target)}
                onRotateAxis={(axis) => rotatePlacement(container.id, placement.id, axis)}
                clearEditNotice={clearEditNotice}
                rotateModeActive={rotateModeActive}
                containerTemplate={activeContainerTemplate}
                otherPlacements={container.placements.filter((p) => p.id !== placement.id)}
                templatesById={templatesById}
              />
            );
          }
          return (
            <CargoBox3D
              key={placement.id}
              placement={placement}
              template={templatesById.get(placement.cargoTemplateId)}
              selected={isSelected}
              highlighted={placement.id === highlightedPlacementId}
              onSelect={handleSelectPlacement}
              disableSelect={rotateModeActive}
            />
          );
        })}
        <CenterOfGravityMarker container={container} containerTemplate={activeContainerTemplate} />
      </Canvas>
      {editNotice && <div className="edit-notice-banner">⚠ {editNotice}</div>}
      <SceneCornerCluster
        simulating={isSimulating}
        onToggleSimulating={() => setViewMode(isSimulating ? '3D' : 'STEP_SIMULATION')}
        rotateMode={
          canEdit && selectedPlacementId && container
            ? { active: rotateModeActive, onToggle: toggleRotateMode }
            : undefined
        }
        container={container}
        raised={isSimulating}
      />
      {isSimulating && (
        <StepSimulationControls
          stepIndex={stepIndex}
          total={totalSteps}
          currentPlacement={currentPlacement}
          currentTemplate={currentPlacement ? templatesById.get(currentPlacement.cargoTemplateId) : undefined}
          onPrev={() => setCurrentStepIndex(clampStepIndex(stepIndex - 1, totalSteps))}
          onNext={() => setCurrentStepIndex(clampStepIndex(stepIndex + 1, totalSteps))}
          onScrub={(index) => setCurrentStepIndex(clampStepIndex(index, totalSteps))}
        />
      )}
    </div>
  );
}
