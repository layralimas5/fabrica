import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarDays, FileText, FlaskConical, ImageIcon, Sparkles, Trophy, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAccounts, useAssets, useBrandKits, useCarousels, usePresets } from '../app/data';
import { PresetBar } from '../create/PresetBar';
import { AnalyticsAssist, useRecommendations } from '../create/AnalyticsAssist';
import { checkCopies, SimilarityDialog, type CopyWarning } from '../create/SimilarityCheck';
import { useSimilaritySettings } from '../app/planningSettings';
import { useContentRecords, useExperiments } from '../app/data';
import { recordFromCarousel } from '../domain/winners/fromCarousel';
import { EXPLORATION_LEVELS, guidanceFor, planCopies, type ExplorationLevel } from '../domain/analytics/intelligence';
import { TextStylePanel } from '../create/TextStylePanel';
import { CopyAppImage } from '../create/CopyAppImage';
import { TestBriefCard } from '../create/TestBriefCard';
import { briefProblems, defaultBrief, defaultVersion, setVariables, VERSION_LABELS, versionsChosenPerCopy, type TestBrief } from '../domain/experiments/brief';
import { variablesOf, type TestVariable } from '../domain/experiments/experiment';
import type { CreateSettings, Preset } from '../domain/preset';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { createCarousels, MAX_TEST_VARIANTS, type CopySetting } from '../application/createCarousels';
import { readHandoff } from '../application/winnerHandoff';
import { readPlan } from '../application/calendarPlan';
import type { ContentOrigin } from '../domain/winners/record';
import { ShadePicker } from '../brand/ShadePicker';
import { StylePicker } from '../brand/StylePicker';
import type { RenderContext } from '../app/slideRendering';
import { DEFAULT_SHADE, type ImageShade } from '../domain/shade';
import { countByDay, distributeDates, formatDay, MAX_PER_DAY, todayIso } from '../domain/schedule';
import { ImagePickerDialog } from '../editor/ImagePickerDialog';
import { AssetThumb } from '../ui/AssetThumb';
import { ACCEPTED_IMAGE_TYPES, type Asset, inFolders, isAcceptedImage, isPhotoLike, PRODUCT_FOLDER, UPLOAD_RULES_MESSAGE } from '../domain/asset';
import { MOMENTUMM_STARTER, photoFoldersOf, productOf, type VisualStyle } from '../domain/brandKit';
import { accountLabel, accountsFor, identityOf, isActiveAccount } from '../domain/account';
import { useAccountScope } from '../app/accountScope';
import {
  CAROUSEL_FORMATS,
  defaultFormatFor,
  FORMAT_SIZES,
  formatFitsPlatform,
  formatSizeLabel,
  PLATFORM_FORMAT_OPTIONS,
  PLATFORM_LABELS,
  PLATFORMS,
  type CarouselFormat,
  DEFAULT_TEXT_STYLE,
  PRODUCT_DISPLAY_LABELS,
  PRODUCT_DISPLAYS,
  type CopyMode,
  type ProductDisplay,
  type Platform,
  type TextStyle,
} from '../domain/carousel';
import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPES,
  OBJECTIVE_LABELS,
  OBJECTIVES,
  SLIDE_COUNT_OPTIONS,
  type ContentType,
  type Objective,
  type SlideCountOption,
} from '../domain/content';
import { hasNumberedSlides, parseScript, scriptStats, splitCopies } from '../domain/script';
import { FolderPicker } from '../ui/FolderPicker';
import { NamePicker, type NameOption } from '../ui/NamePicker';
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../ui/primitives';

const AI_STEPS = ['Analisando a copy', 'Encontrando o gancho', 'Estruturando os slides', 'Escolhendo imagens da biblioteca', 'Montando o design'];
const MANUAL_STEPS = ['Lendo seus textos', 'Escolhendo imagens da biblioteca', 'Montando os slides'];
const MIN_AI_COPY_LENGTH = 20;
const MAX_COPY_FILE_BYTES = 1_000_000;
const MAX_COPIES = 30;
const AI_PLACEHOLDER = 'Cole sua copy ou só o tema. Ex: Metas sem sistema são só desejos com prazo.';
const MODE_STORAGE_KEY = 'fabrica:copy-mode';
const PLATFORM_STORAGE_KEY = 'fabrica:platform';
const FORMAT_STORAGE_KEY = 'fabrica:format';
const ACCOUNT_STORAGE_KEY = 'fabrica:account';
const PRESET_STORAGE_KEY = 'fabrica:preset';
const ANALYTICS_STORAGE_KEY = 'fabrica:use-analytics';
const EXPLORATION_STORAGE_KEY = 'fabrica:exploration';
const PLATFORM_DETAILS: Record<Platform, string> = { instagram: 'Feed, perfil, stories', tiktok: 'Carrossel de fotos' };

const MANUAL_PLACEHOLDER = `Tema do carrossel: Rotina que sobrevive ao dia ruim
Slide 1, ninguém te conta isso sobre disciplina
Slide 2, você não precisa de motivação // precisa de rotina
Slide 3, comece com 10 minutos por dia
Legenda: salva pra lembrar amanhã #rotina
---
Slide 1, 3 hábitos que mudaram minha manhã
Slide 2, acordar sem celular`;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return allowed.find((item) => item === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

function readStoredText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rememberText(key: string, value: string | null): void {
  if (value) remember(key, value);
  else {
    try {
      localStorage.removeItem(key);
    } catch {
      // Remembering a choice is a convenience; the page works without storage.
    }
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering a choice is a convenience; the page works without storage.
  }
}

export function CreatePage() {
  const services = useServices();
  const navigate = useNavigate();
  const brands = useBrandKits();
  const assets = useAssets();
  const accounts = useAccounts();
  const savedCarousels = useCarousels();
  const presets = usePresets();
  const location = useLocation();
  /** Copies and settings sent by a winner (Usar como modelo, Criar variações, Família). Read once. */
  const [handoff] = useState(() => readHandoff(location.state));
  const [origin, setOrigin] = useState<ContentOrigin | null>(handoff?.origin ?? null);
  /** Planned on the calendar ("Gerar conteúdo agora"): day, time, theme, category, objective and test come along. */
  const [calendarPlan, setCalendarPlan] = useState(() => (handoff ? null : readPlan(location.state)));

  const [platform, setPlatform] = useState<Platform>(() => readStored(PLATFORM_STORAGE_KEY, PLATFORMS, 'instagram'));
  const [format, setFormat] = useState<CarouselFormat>(() => {
    const stored = readStored(FORMAT_STORAGE_KEY, CAROUSEL_FORMATS, defaultFormatFor(platform));
    return formatFitsPlatform(stored, platform) ? stored : defaultFormatFor(platform);
  });
  const [mode, setMode] = useState<CopyMode>(() => (handoff ? 'manual' : readStored(MODE_STORAGE_KEY, ['manual', 'ai'] as const, 'manual')));
  /** One entry per copy box; each copy becomes a carousel. */
  const [copies, setCopies] = useState<string[]>(() => (handoff?.copies.length ? handoff.copies.slice(0, MAX_COPIES) : ['']));
  /** Objective and type of each copy box; null fields follow the batch defaults of step 3. */
  const [copySettings, setCopySettings] = useState<CopySetting[]>([]);
  /** "Usar dados do Analytics" and how much of the batch keeps testing. Remembered in this browser. */
  const [useAnalytics, setUseAnalytics] = useState(() => readStored(ANALYTICS_STORAGE_KEY, ['on', 'off'] as const, 'off') === 'on');
  const [exploration, setExploration] = useState<ExplorationLevel>(() => readStored(EXPLORATION_STORAGE_KEY, EXPLORATION_LEVELS, 'balanced'));
  const [brandId, setBrandId] = useState('');
  const [accountId, setAccountId] = useState<string | null>(() => readStoredText(ACCOUNT_STORAGE_KEY));
  const [contentType, setContentType] = useState<ContentType>('auto');
  const [slideCount, setSlideCount] = useState<SlideCountOption>('auto');
  const [styles, setStyles] = useState<VisualStyle[]>(['minimalista']);
  const [testing, setTesting] = useState(false);
  const [objective, setObjective] = useState<Objective>('engajamento');
  const [addCta, setAddCta] = useState(false);
  const [includeProduct, setIncludeProduct] = useState(true);
  const [productDisplay, setProductDisplay] = useState<ProductDisplay>('full');
  const [productImageId, setProductImageId] = useState<string | null>(null);
  const [pickingProductImage, setPickingProductImage] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const productFileInput = useRef<HTMLInputElement>(null);
  const copyFileInput = useRef<HTMLInputElement>(null);
  const copyImageInput = useRef<HTMLInputElement>(null);
  /** Copy box receiving the next uploaded or picked app image. */
  const [copyImageTarget, setCopyImageTarget] = useState<number | null>(null);
  const [pickingCopyImage, setPickingCopyImage] = useState(false);
  const [uploadingCopyImage, setUploadingCopyImage] = useState<number | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [shade, setShade] = useState<ImageShade>(DEFAULT_SHADE);
  const [postWithImages, setPostWithImages] = useState(true);
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [project, setProject] = useState('');
  const [folder, setFolder] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [startDate, setStartDate] = useState(todayIso);
  const [perDay, setPerDay] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingStarter, setCreatingStarter] = useState(false);
  const [presetId, setPresetId] = useState<string | null>(() => readStoredText(PRESET_STORAGE_KEY));
  /** Settings waiting for the brand to settle: changing the brand resets styles and folders, so those apply after. */
  const [pendingPreset, setPendingPreset] = useState<CreateSettings | null>(null);

  const brand = brands.data.find((kit) => kit.id === brandId) ?? brands.data[0];
  const scope = useAccountScope();
  const platformAccounts = accountsFor(accounts.data.filter(isActiveAccount), platform);
  const account = platformAccounts.find((item) => item.id === accountId) ?? platformAccounts[0] ?? null;
  const intelligence = useRecommendations(account?.id ?? null);
  const records = useContentRecords();
  const experiments = useExperiments();
  /** Ficha do teste: the batch becomes one experiment in Testes. */
  const [testOn, setTestOn] = useState(false);
  const [brief, setBrief] = useState<TestBrief>(() => defaultBrief(['horario']));
  /** Controle / Variação marked on each copy box; null keeps the alternating default. */
  const [copyVersions, setCopyVersions] = useState<(string | null)[]>([]);
  const { settings: similaritySettings } = useSimilaritySettings();
  /** Detector de Similaridade: warnings shown before creating; null when nothing to show. */
  const [warnings, setWarnings] = useState<CopyWarning[] | null>(null);
  const accountIdentity = useMemo(() => (account ? identityOf(account) : null), [account]);
  const product = brand ? productOf(brand) : null;
  const folderCounts = useMemo(() => countByFolder(assets.data), [assets.data]);
  const availableImages = assets.data.filter((asset) => inFolders(asset, folders)).length;
  const copyInfo = useMemo(
    () =>
      copies.map((copy) => {
        const parsed = parseScript(copy);
        // An "Objetivo:" or "Tipo:" line written in the copy wins over the box selection.
        const fromScript = { objective: parsed.find((block) => block.objective)?.objective ?? null, contentType: parsed.find((block) => block.contentType)?.contentType ?? null };
        const hasAppSlide = parsed.some((block) => block.productIndex !== null);
        return { copy, numbered: hasNumberedSlides(copy), stats: scriptStats(parsed), fromScript, hasAppSlide };
      }),
    [copies],
  );
  const stats = useMemo(
    () => copyInfo.reduce((sum, info) => ({ carousels: sum.carousels + info.stats.carousels, slides: sum.slides + info.stats.slides }), { carousels: 0, slides: 0 }),
    [copyInfo],
  );
  const numbered = copyInfo.some((info) => info.numbered);
  const carouselsIn = (info: (typeof copyInfo)[number]) => (mode === 'manual' || info.numbered ? info.stats.carousels : info.copy.trim() ? 1 : 0);
  const blocks = copyInfo.reduce((sum, info) => sum + carouselsIn(info), 0);
  /** Slides of written copies (loose AI copies only know their size after generating). */
  const sampleText = useMemo(() => {
    for (const copy of copies) {
      const first = parseScript(copy)[0]?.slides[0];
      if (first) return first;
    }
    return null;
  }, [copies]);
  const knownSlides = copyInfo.reduce((sum, info) => sum + (mode === 'manual' || info.numbered ? info.stats.slides : 0), 0);
  const maxPerDay = Math.max(1, Math.min(MAX_PER_DAY, blocks || MAX_PER_DAY));
  const effectivePerDay = Math.min(perDay, maxPerDay);
  const total = blocks * styles.length;
  /** "Testar formatos" and the Design chip of the ficha are kept in step by the handlers below. */
  const testBrief = brief;
  const testProblems = testOn
    ? briefProblems(testBrief, {
        carousels: total,
        styles: styles.length,
        copyVersions: copies.flatMap((copy, index) => (copy.trim() ? [copyVersions[index] ?? defaultVersion(index)] : [])),
      })
    : [];
  const knownProjects = useMemo(() => namesWithCounts(savedCarousels.data.map((carousel) => carousel.project)), [savedCarousels.data]);
  const knownFolders = useMemo(
    () => namesWithCounts(savedCarousels.data.filter((carousel) => carousel.project === project.trim()).map((carousel) => carousel.folder)),
    [savedCarousels.data, project],
  );
  const defaultProject = account?.project || account?.name || brand?.name || '';
  const plannedDays = scheduling && blocks > 0 ? countByDay(distributeDates(blocks, { startDate, perDay: effectivePerDay })) : [];

  useEffect(() => {
    if (!brand) return;
    setBrandId(brand.id);
    setStyles([brand.visualStyle]);
    setTesting(false);
    setProductImageId(productOf(brand)?.imageAssetId ?? null);
    setFolders(photoFoldersOf(brand));
  }, [brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseAccount = (id: string | null) => {
    setAccountId(id);
    rememberText(ACCOUNT_STORAGE_KEY, id);
    const chosen = accounts.data.find((item) => item.id === id);
    if (chosen?.brandKitId && brands.data.some((kit) => kit.id === chosen.brandKitId)) setBrandId(chosen.brandKitId);
  };

  // The account's brand comes along when the account is picked or changes with the network.
  useEffect(() => {
    if (account?.brandKitId && brands.data.some((kit) => kit.id === account.brandKitId)) setBrandId(account.brandKitId);
  }, [account?.id, brands.data.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Declared after the brand and account effects so it runs last and wins over their resets.
  useEffect(() => {
    if (!pendingPreset || !brand) return;
    const wanted = pendingPreset.brandKitId && brands.data.some((kit) => kit.id === pendingPreset.brandKitId) ? pendingPreset.brandKitId : null;
    if (wanted && brand.id !== wanted) {
      setBrandId(wanted);
      return;
    }
    setObjective(pendingPreset.objective);
    setContentType(pendingPreset.contentType);
    setSlideCount(pendingPreset.slideCount);
    setStyles(pendingPreset.styles);
    setTesting(pendingPreset.styles.length > 1);
    setPostWithImages(pendingPreset.postWithImages);
    setTextStyle(pendingPreset.textStyle);
    setShade(pendingPreset.shade);
    setFolders(pendingPreset.folders);
    setIncludeProduct(pendingPreset.includeProduct);
    setProductDisplay(pendingPreset.productDisplay);
    setAddCta(pendingPreset.addCta);
    setProject(pendingPreset.project);
    setFolder(pendingPreset.folder);
    setScheduling(pendingPreset.scheduling);
    setPerDay(pendingPreset.perDay);
    setPendingPreset(null);
  }, [pendingPreset, brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentSettings = (): CreateSettings => ({
    platform,
    format,
    accountId: account?.id ?? null,
    mode,
    brandKitId: brand?.id ?? null,
    objective,
    contentType,
    slideCount,
    styles,
    postWithImages,
    textStyle,
    shade,
    folders,
    includeProduct,
    productDisplay,
    addCta,
    project: project.trim(),
    folder: folder.trim(),
    scheduling,
    perDay,
  });

  const choosePreset = (preset: Preset | null) => {
    setPresetId(preset?.id ?? null);
    rememberText(PRESET_STORAGE_KEY, preset?.id ?? null);
    if (!preset) return;
    const settings = preset.settings;
    setPlatform(settings.platform);
    remember(PLATFORM_STORAGE_KEY, settings.platform);
    changeFormat(formatFitsPlatform(settings.format, settings.platform) ? settings.format : defaultFormatFor(settings.platform));
    setAccountId(settings.accountId);
    rememberText(ACCOUNT_STORAGE_KEY, settings.accountId);
    changeMode(settings.mode);
    if (settings.brandKitId && brands.data.some((kit) => kit.id === settings.brandKitId)) setBrandId(settings.brandKitId);
    setPendingPreset(settings);
  };

  // Opening the screen again brings back the last preset used, already applied.
  const restoredPreset = useRef(false);
  useEffect(() => {
    if (restoredPreset.current || presets.loading || brands.loading || accounts.loading || scope.loading) return;
    restoredPreset.current = true;
    if (handoff) return applyHandoff();
    if (calendarPlan) return applyCalendarPlan();
    const last = presets.data.find((preset) => preset.id === presetId);
    if (last) choosePreset(last);
    // The account picked at the top ("Conta atual") wins over the one saved in the preset.
    if (scope.current && isActiveAccount(scope.current)) {
      setPlatform(scope.current.platform);
      if (!formatFitsPlatform(format, scope.current.platform)) setFormat(defaultFormatFor(scope.current.platform));
      chooseAccount(scope.current.id);
    }
  }, [presets.loading, brands.loading, accounts.loading, scope.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The winner's network, account, brand and look come along; the rest of the screen keeps what the user had. */
  const applyHandoff = () => {
    if (!handoff) return;
    // Opening the screen again (back, reload) must not bring the same copies back.
    navigate(location.pathname, { replace: true, state: null });
    const { settings } = handoff;
    const nextPlatform = settings.platform ?? platform;
    setPlatform(nextPlatform);
    const nextFormat = settings.format && formatFitsPlatform(settings.format, nextPlatform) ? settings.format : formatFitsPlatform(format, nextPlatform) ? format : defaultFormatFor(nextPlatform);
    setFormat(nextFormat);
    if (settings.accountId && accounts.data.some((item) => item.id === settings.accountId)) setAccountId(settings.accountId);
    const targetBrand = brands.data.find((kit) => kit.id === settings.brandKitId) ?? brand;
    if (!targetBrand) return;
    setBrandId(targetBrand.id);
    setPendingPreset({
      ...currentSettings(),
      platform: nextPlatform,
      format: nextFormat,
      mode: 'manual',
      brandKitId: targetBrand.id,
      styles: settings.style ? [settings.style] : [targetBrand.visualStyle],
      folders: photoFoldersOf(targetBrand),
      scheduling: false,
    });
  };

  const applyCalendarPlan = () => {
    if (!calendarPlan) return;
    navigate(location.pathname, { replace: true, state: null });
    const planned = accounts.data.find((item) => item.id === calendarPlan.accountId) ?? null;
    const nextPlatform = planned?.platform ?? calendarPlan.platform;
    setPlatform(nextPlatform);
    if (!formatFitsPlatform(format, nextPlatform)) setFormat(defaultFormatFor(nextPlatform));
    if (planned) chooseAccount(planned.id);
    if (calendarPlan.objective) setObjective(calendarPlan.objective);
    if (calendarPlan.title) setCopies([`Tema do carrossel: ${calendarPlan.title}\nSlide 1, ${calendarPlan.title}`]);
    setScheduling(true);
    setStartDate(calendarPlan.date);
    setPerDay(MAX_PER_DAY);
  };

  const savePreset = async (name: string, overwriteId: string | null) => {
    const input = { name, settings: currentSettings() };
    const saved = overwriteId ? await services.presets.update(overwriteId, input) : await services.presets.create(input);
    presets.setData((current) => (overwriteId ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name))));
    setPresetId(saved.id);
    rememberText(PRESET_STORAGE_KEY, saved.id);
  };

  const deletePreset = async (id: string) => {
    try {
      await services.presets.remove(id);
      presets.setData((current) => current.filter((item) => item.id !== id));
      setPresetId(null);
      rememberText(PRESET_STORAGE_KEY, null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const changeMode = (next: CopyMode) => {
    setMode(next);
    remember(MODE_STORAGE_KEY, next);
  };

  const changePlatform = (next: Platform) => {
    setPlatform(next);
    remember(PLATFORM_STORAGE_KEY, next);
    if (!formatFitsPlatform(format, next)) changeFormat(defaultFormatFor(next));
  };

  const changeFormat = (next: CarouselFormat) => {
    setFormat(next);
    remember(FORMAT_STORAGE_KEY, next);
  };

  /** Opens the ficha with suggestions for the variable, or points an open one at the format test. */
  const startTest = (variable: TestVariable) => {
    if (!testOn) {
      setTestOn(true);
      setBrief(defaultBrief([variable], experiments.data.filter((item) => variablesOf(item).includes(variable)).length + 1));
    } else if (!brief.variables.includes(variable)) setBrief((current) => setVariables(current, [...current.variables, variable]));
  };

  const setFormatTest = (enabled: boolean) => {
    setTesting(enabled);
    setStyles((current) => (enabled ? current : current.slice(0, 1)));
  };

  const toggleTesting = (enabled: boolean) => {
    setFormatTest(enabled);
    if (enabled) return startTest('design');
    const rest = brief.variables.filter((variable) => variable !== 'design');
    if (rest.length === 0) setTestOn(false);
    setBrief((current) => setVariables(current, rest));
  };

  /** Chips of the ficha: Design turns "Testar formatos" on and off with it. */
  const changeTestVariables = (variables: TestVariable[]) => {
    if (variables.includes('design') !== testing) setFormatTest(variables.includes('design'));
    setBrief((current) => setVariables(current, variables));
  };

  const toggleStyle = (style: VisualStyle) => {
    if (!testing) return setStyles([style]);
    setStyles((current) => {
      if (current.includes(style)) return current.length > 1 ? current.filter((item) => item !== style) : current;
      return current.length >= MAX_TEST_VARIANTS ? current : [...current, style];
    });
  };

  const createStarterBrand = async () => {
    setCreatingStarter(true);
    try {
      const created = await services.brandKits.create(MOMENTUMM_STARTER);
      brands.setData((current) => [...current, created]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreatingStarter(false);
    }
  };

  /** Saves an app print in the Produto folder of the library. */
  const uploadAppPrint = async (file: File): Promise<Asset> => {
    const asset = await services.assets.upload({ file, folder: PRODUCT_FOLDER, kind: 'screenshot', tags: ['app', 'tela', 'produto'] });
    assets.setData((current) => [asset, ...current]);
    return asset;
  };

  const uploadCopyImage = async (file: File | undefined, index: number | null) => {
    if (!file || index === null) return;
    if (!isAcceptedImage(file)) return setError(`Esse arquivo não serve: ${UPLOAD_RULES_MESSAGE}.`);
    setUploadingCopyImage(index);
    setError(null);
    try {
      const asset = await uploadAppPrint(file);
      updateSetting(index, { productImageAssetId: asset.id });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploadingCopyImage(null);
    }
  };

  const uploadProductImage = async (file: File | undefined) => {
    if (!file || !brand || !product) return;
    if (!isAcceptedImage(file)) return setError(`Esse arquivo não serve: ${UPLOAD_RULES_MESSAGE}.`);
    setUploadingProductImage(true);
    setError(null);
    try {
      const asset = await uploadAppPrint(file);
      setProductImageId(asset.id);
      // The first print sent becomes the brand default, so next time it is already selected.
      if (!product.imageAssetId) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...input } = brand;
        const saved = await services.brandKits.update(brand.id, { ...input, product: { ...product, imageAssetId: asset.id } });
        brands.setData((current) => current.map((kit) => (kit.id === saved.id ? saved : kit)));
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploadingProductImage(false);
    }
  };

  /** Mass production: a .txt or .md file with every carousel, same format as pasting. */
  const loadCopyFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_COPY_FILE_BYTES) return setError('Esse arquivo é grande demais. Divida em arquivos de até 1 MB.');
    try {
      const content = await file.text();
      const parts = splitCopies(content);
      // A file with several carousels fills one box per carousel.
      setCopies(parts.length > 1 ? parts.slice(0, MAX_COPIES) : [content]);
      setCopySettings([]);
      setError(parts.length > MAX_COPIES ? `O arquivo tem ${parts.length} carrosséis; entraram os primeiros ${MAX_COPIES}.` : null);
    } catch (cause) {
      setError(`Não consegui ler o arquivo: ${errorMessage(cause)}`);
    }
  };

  /** Each copy follows the plan of the exploration level; what the user set by hand on a copy stays. */
  const withAnalytics = (settings: CopySetting[]): CopySetting[] =>
    planCopies(copies.length, exploration, intelligence.recommendations).map((plan, index) => {
      const own = settings[index] ?? { objective: null, contentType: null };
      return {
        ...own,
        contentType: own.contentType ?? plan.contentType ?? null,
        style: plan.style ?? null,
        slideCount: plan.slideCount ?? null,
        guidance: guidanceFor(intelligence.recommendations, plan),
      };
    });

  /** "Criar nova versão": the similar carousel becomes the model of a remix (its record is created if needed). */
  const newVersionOf = async (carouselId: string) => {
    const similar = savedCarousels.data.find((item) => item.id === carouselId);
    if (!similar) return;
    try {
      const existing = records.data.find((record) => record.carouselId === carouselId);
      const owner = accounts.data.find((item) => item.id === similar.source.accountId) ?? null;
      const record = existing ?? (await services.contentRecords.create({ ...recordFromCarousel(similar, owner, product?.name ?? null), winner: false }));
      navigate(`/vencedores/${record.id}`, { state: { remix: 'model' } });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const generate = async (confirmed = false) => {
    if (!brand) return;
    if (!confirmed) {
      const found = checkCopies({
        copies,
        manual: mode === 'manual',
        account,
        carousels: savedCarousels.data,
        records: records.data,
        theme: calendarPlan?.theme ?? '',
        day: scheduling ? startDate : null,
        originId: origin?.modelId ?? null,
        today: todayIso(),
        settings: similaritySettings,
      });
      if (found.length > 0) return setWarnings(found);
    }
    setWarnings(null);
    setGenerating(true);
    setError(null);
    try {
      const result = await createCarousels(services, {
        platform,
        accountId: account?.id ?? null,
        format,
        brand,
        library: assets.data,
        mode,
        texts: copies,
        copySettings: useAnalytics ? withAnalytics(copySettings) : copySettings,
        plan: calendarPlan ? { theme: calendarPlan.theme, category: calendarPlan.category, scheduledTime: calendarPlan.time } : undefined,
        experiment: calendarPlan?.experimentId ? { id: calendarPlan.experimentId, name: calendarPlan.title || calendarPlan.theme || 'Teste', variant: calendarPlan.variant || 'Variação' } : null,
        contentType,
        objective,
        slideCount,
        folders,
        styles,
        shade,
        addCta,
        includeProduct: product !== null && includeProduct,
        productImageAssetId: productImageId,
        productDisplay,
        postWithImages,
        textStyle,
        project: project.trim() || defaultProject,
        folder,
        schedule: scheduling ? { startDate, perDay: effectivePerDay } : null,
        origin,
        test: testOn ? { brief: testBrief, copyVersions: copies.map((_, index) => copyVersions[index] ?? null) } : null,
      });
      // The planned entry is replaced by the carousels just created.
      if (calendarPlan?.entryId) await services.calendarEntries.remove(calendarPlan.entryId).catch(() => undefined);
      if (testOn && result.experimentIds[0]) navigate(`/testes/${result.experimentIds[0]}`);
      else if (scheduling) navigate(`/calendario?visao=semana&data=${startDate}`, { state: { created: result.carousels.length } });
      else if (result.experimentIds.length === 1) navigate(`/testes/${result.experimentIds[0]}`);
      else if (result.experimentIds.length > 1) navigate('/testes', { state: { created: result.carousels.length } });
      else if (result.carousels.length === 1) navigate(`/carrossel/${result.carousels[0].id}`);
      else navigate('/projetos', { state: { created: result.carousels.length } });
    } catch (cause) {
      setError(errorMessage(cause));
      setGenerating(false);
    }
  };

  const previewStyle = styles[0] ?? brand?.visualStyle ?? 'minimalista';
  const shadeContext: Omit<RenderContext, 'shade'> | null = useMemo(
    () => (brand ? { brand, assets: assets.data, repo: services.assets, format, visualStyle: previewStyle, total: 1, account: accountIdentity } : null),
    [brand, assets.data, services.assets, format, previewStyle, accountIdentity],
  );

  if (brands.loading) return <Spinner />;

  // Every carousel belongs to an account, so Analytics can compare each account with itself.
  const ready = account !== null && copyInfo.some((info) => (mode === 'manual' || info.numbered ? info.stats.slides > 0 : info.copy.trim().length >= MIN_AI_COPY_LENGTH));
  const changeCopyCount = (count: number) => {
    setCopies((current) => (count <= current.length ? current.slice(0, count) : [...current, ...Array.from({ length: count - current.length }, () => '')]));
    setCopySettings((current) => current.slice(0, count));
    setCopyVersions((current) => current.slice(0, count));
  };
  const versionAt = (index: number) => copyVersions[index] ?? defaultVersion(index);
  const setVersionAt = (index: number, version: string) =>
    setCopyVersions((current) => Array.from({ length: Math.max(current.length, index + 1) }, (_, position) => (position === index ? version : (current[position] ?? null))));
  const choosesVersions = testOn && versionsChosenPerCopy(testBrief.variables);
  const settingAt = (index: number): CopySetting => copySettings[index] ?? { objective: null, contentType: null };
  const updateSetting = (index: number, patch: Partial<CopySetting>) =>
    setCopySettings((current) => {
      const next = Array.from({ length: Math.max(current.length, index + 1) }, (_, position) => current[position] ?? { objective: null, contentType: null });
      next[index] = { ...next[index], ...patch };
      return next;
    });
  const updateCopy = (index: number, value: string) => setCopies((current) => current.map((copy, position) => (position === index ? value : copy)));
  const photo = assets.data.find((asset) => isPhotoLike(asset) && asset.id !== productImageId);
  const productImage = assets.data.find((asset) => asset.id === productImageId);
  /** Image every copy without its own uses in the APP slide. */
  const batchAppImage = product && includeProduct ? (productImage ?? null) : null;
  const assetById = (id: string | null | undefined) => (id ? (assets.data.find((asset) => asset.id === id) ?? null) : null);
  const chooseCopyImage = (index: number, source: 'upload' | 'library') => {
    setCopyImageTarget(index);
    if (source === 'upload') copyImageInput.current?.click();
    else setPickingCopyImage(true);
  };
  const copyAppImage = (index: number) => (
    <CopyAppImage
      index={index}
      asset={assetById(settingAt(index).productImageAssetId)}
      fallback={batchAppImage}
      required={(mode === 'manual' || copyInfo[index].numbered) && copyInfo[index].hasAppSlide}
      library={assets.data.length > 0}
      uploading={uploadingCopyImage === index}
      disabled={generating}
      onUpload={() => chooseCopyImage(index, 'upload')}
      onPick={() => chooseCopyImage(index, 'library')}
      onClear={() => updateSetting(index, { productImageAssetId: null })}
    />
  );

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Cole a copy. Receba os carrosséis prontos.</h1>
        <p className="mt-3 text-pretty text-sm text-muted sm:text-base">Você escolhe onde vai postar, o texto, a formatação e as fotos. A ferramenta coloca cada frase e cada foto no slide certo.</p>
      </header>

      {brands.error && <Alert>{brands.error}</Alert>}

      {brands.data.length === 0 || !brand ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-ink">Primeiro, uma conta</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Cada conta que você produz tem um Brand Kit: cores, fontes, tom de voz, produto e pastas de fotos. Cria o primeiro ou começa por um modelo.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" loading={creatingStarter} onClick={() => void createStarterBrand()}>
              Usar o kit Momentumm
            </Button>
            <Link to="/marcas" className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Criar do zero
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          {calendarPlan && (
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent/[0.06] px-5 py-3">
              <CalendarDays className="size-4 shrink-0 text-accent" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-ink">
                Planejado no calendário pra <span className="font-medium">{formatDay(calendarPlan.date)}</span>
                {calendarPlan.time ? ` às ${calendarPlan.time}` : ''}
                {calendarPlan.theme ? ` · tema ${calendarPlan.theme}` : ''}
                {calendarPlan.experimentId ? ' · conteúdo de teste' : ''}.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setCalendarPlan(null)}>
                Desvincular
              </Button>
            </div>
          )}
          {origin && (
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-amber-500/[0.07] px-5 py-3">
              <Trophy className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-ink">
                Criando a partir do vencedor <span className="font-medium">“{origin.modelTitle}”</span>
                {origin.family ? ` · ${origin.family}` : ''}. Os carrosséis ficam ligados a ele pra comparar depois.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setOrigin(null)}>
                Desvincular
              </Button>
            </div>
          )}
          <PresetBar presets={presets.data} selectedId={presetId} onSelect={choosePreset} onSave={savePreset} onDelete={deletePreset} disabled={generating} />
          <Step number={1} title="Onde vai postar">
            <div role="radiogroup" aria-label="Rede social" className="grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1">
              {PLATFORMS.map((item) => (
                <ChoiceCard key={item} active={platform === item} onClick={() => changePlatform(item)} title={PLATFORM_LABELS[item]} detail={PLATFORM_DETAILS[item]} />
              ))}
            </div>
            <p className="mb-2 mt-4 text-xs font-medium text-muted">Proporção</p>
            <div role="radiogroup" aria-label="Proporção" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLATFORM_FORMAT_OPTIONS[platform].map((option) => (
                <FormatCard key={option.format} format={option.format} use={option.use} active={format === option.format} onClick={() => changeFormat(option.format)} disabled={generating} />
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              {platformAccounts.length > 0 ? (
                <Field label={`Conta do ${PLATFORM_LABELS[platform]}`} htmlFor="account" className="sm:w-80">
                  <Select id="account" value={account?.id ?? ''} onChange={(e) => chooseAccount(e.target.value || null)} disabled={generating}>
                    {platformAccounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {accountLabel(item)} · @{item.handle}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Cadastre uma conta do {PLATFORM_LABELS[platform]} pra criar: todo carrossel pertence a uma conta, e é assim que o Analytics compara cada uma.
                </p>
              )}
              <Link to="/contas" className="text-xs font-medium text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {platformAccounts.length > 0 ? 'Gerenciar contas' : 'Cadastrar conta'}
              </Link>
            </div>
          </Step>

          <Step number={2} title="A copy">
            <div role="radiogroup" aria-label="Como a copy entra nos slides" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1">
              <ChoiceCard active={mode === 'ai'} onClick={() => changeMode('ai')} title="Separar pra mim" detail="Cola a copy inteira e a ferramenta divide nos slides" />
              <ChoiceCard active={mode === 'manual'} onClick={() => changeMode('manual')} title="Já separei" detail="Slide 1, texto · Slide 2, texto, sem mudar nenhuma palavra" />
            </div>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Field label="Quantas copys" htmlFor="copy-count" className="w-44">
                <Select id="copy-count" value={copies.length} onChange={(e) => changeCopyCount(Number(e.target.value))} disabled={generating}>
                  {Array.from({ length: MAX_COPIES }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>
                      {count} {count === 1 ? 'copy' : 'copys'}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="pb-2.5 text-xs text-faint">Cada copy vira um carrossel. A quantidade também define quantos você programa por dia no passo 5.</p>
            </div>
            <div className="rounded-2xl border border-line">
              {copies.length === 1 ? (
                <>
                  <label htmlFor="copy" className="sr-only">
                    {mode === 'manual' ? 'Textos dos carrosséis' : 'Copy ou ideia'}
                  </label>
                  <Textarea
                    id="copy"
                    value={copies[0]}
                    onChange={(event) => updateCopy(0, event.target.value)}
                    placeholder={mode === 'manual' ? MANUAL_PLACEHOLDER : AI_PLACEHOLDER}
                    rows={11}
                    className={clsx('min-h-60 border-0 bg-transparent px-4 py-3 text-base focus-visible:ring-0', mode === 'manual' && 'font-mono text-[14px]')}
                    disabled={generating}
                  />
                  <div className="px-4 pb-3">
                    {copyAppImage(0)}
                  </div>
                </>
              ) : (
                <ol className="divide-y divide-line">
                  {copyInfo.map((info, index) => (
                    <li key={index} className="px-4 py-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <label htmlFor={`copy-${index}`} className="text-xs font-semibold text-ink">
                            Copy {index + 1}
                          </label>
                          <span className="text-[11px] text-faint">
                            {info.copy.trim() ? (mode === 'manual' || info.numbered ? `${info.stats.slides} slides` : 'a ferramenta divide') : 'vazia'}
                          </span>
                        </div>
                        <CopyTags
                          index={index}
                          setting={settingAt(index)}
                          fromScript={info.fromScript}
                          defaults={{ objective, contentType }}
                          manual={mode === 'manual'}
                          disabled={generating}
                          onChange={(patch) => updateSetting(index, patch)}
                          version={choosesVersions ? { value: versionAt(index), onChange: (value) => setVersionAt(index, value) } : null}
                        />
                      </div>
                      <Textarea
                        id={`copy-${index}`}
                        value={info.copy}
                        onChange={(event) => updateCopy(index, event.target.value)}
                        placeholder={mode === 'manual' ? 'Slide 1, texto\nSlide 2, texto' : 'Cole a copy ou o tema deste carrossel'}
                        rows={5}
                        className={clsx('text-sm', mode === 'manual' && 'font-mono text-[13px]')}
                        disabled={generating}
                      />
                      {copyAppImage(index)}
                    </li>
                  ))}
                </ol>
              )}
              <input
                ref={copyImageInput}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                className="hidden"
                aria-label="Enviar imagem do app da copy"
                onChange={(event) => {
                  void uploadCopyImage(event.target.files?.[0], copyImageTarget);
                  event.target.value = '';
                }}
              />
              <ImagePickerDialog
                open={pickingCopyImage}
                title={copyImageTarget === null ? 'Imagem do app' : `Imagem do app da copy ${copyImageTarget + 1}`}
                assets={assets.data}
                currentId={copyImageTarget === null ? null : (settingAt(copyImageTarget).productImageAssetId ?? null)}
                slideText={`${product?.name ?? ''} app tela print produto`}
                carouselFolders={[]}
                onPick={(id) => {
                  if (copyImageTarget !== null) updateSetting(copyImageTarget, { productImageAssetId: id });
                  setPickingCopyImage(false);
                }}
                onClose={() => setPickingCopyImage(false)}
              />

              {(mode === 'manual' || numbered) && (
                <div className="flex flex-col gap-1 px-4 pb-3 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    {mode === 'ai' ? (
                      <span className="font-medium text-ink">Você já numerou os slides, então a ferramenta respeita a sua divisão e não muda o texto. </span>
                    ) : null}
                    <code className="text-muted">Slide 1</code> começa o slide 1 (só o texto aparece) · <code className="text-muted">SLIDE 6 — PRODUTO</code> ou <code className="text-muted">SLIDE - APP</code> recebe o print · linha em branco vira espaço entre parágrafos · sem "Slide N", cada linha é um slide · <code className="text-muted">Legenda:</code> e <code className="text-muted">Tema do carrossel:</code> são lidos à parte · <code className="text-muted">Objetivo: conversão</code> e <code className="text-muted">Tipo: dor</code> valem só pra aquele carrossel
                  </p>
                  <p className="shrink-0 font-medium text-muted" aria-live="polite">
                    {blocks} {blocks === 1 ? 'carrossel' : 'carrosséis'} · {stats.slides} slides
                  </p>
                </div>
              )}

            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => copyFileInput.current?.click()} disabled={generating}>
                <FileText className="size-4" aria-hidden /> Abrir arquivo .txt
              </Button>
              <input
                ref={copyFileInput}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="hidden"
                aria-label="Arquivo com as copys"
                onChange={(event) => {
                  void loadCopyFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>
          </Step>

          <Step number={3} title="A formatação">
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Marca" htmlFor="brand">
                  <Select id="brand" value={brand.id} onChange={(e) => setBrandId(e.target.value)} disabled={generating}>
                    {brands.data.map((kit) => (
                      <option key={kit.id} value={kit.id}>
                        {kit.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={copies.length > 1 ? 'Objetivo padrão' : 'Objetivo'} htmlFor="objective" hint={copies.length > 1 ? 'Vale pras copys sem objetivo próprio.' : undefined}>
                  <Select id="objective" value={objective} onChange={(e) => setObjective(e.target.value as Objective)} disabled={generating}>
                    {OBJECTIVES.map((item) => (
                      <option key={item} value={item}>
                        {OBJECTIVE_LABELS[item]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={copies.length > 1 ? 'Tipo padrão' : 'Tipo de carrossel'}
                  htmlFor="type"
                  hint={mode === 'manual' ? 'No "Já separei" o texto não muda: o tipo fica registrado pra análise.' : copies.length > 1 ? 'Vale pras copys sem tipo próprio.' : undefined}
                >
                  <Select id="type" value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)} disabled={generating}>
                    {CONTENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {typeLabel(type, mode === 'manual')}
                      </option>
                    ))}
                  </Select>
                </Field>
                {mode === 'ai' ? (
                  <>
                    <Field label="Slides" htmlFor="count">
                      <Select id="count" value={String(slideCount)} onChange={(e) => setSlideCount(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as SlideCountOption))} disabled={generating}>
                        {SLIDE_COUNT_OPTIONS.map((count) => (
                          <option key={count} value={String(count)}>
                            {count === 'auto' ? 'Automático' : count}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                ) : (
                  <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={addCta} onChange={(e) => setAddCta(e.target.checked)} disabled={generating} />
                    Adicionar no fim o CTA do objetivo
                  </label>
                )}
              </div>

              <AnalyticsAssist
                enabled={useAnalytics}
                onEnabled={(enabled) => {
                  setUseAnalytics(enabled);
                  remember(ANALYTICS_STORAGE_KEY, enabled ? 'on' : 'off');
                  if (enabled && exploration !== 'safe') startTest('template');
                }}
                level={exploration}
                onLevel={(level) => {
                  setExploration(level);
                  remember(EXPLORATION_STORAGE_KEY, level);
                  if (useAnalytics && level !== 'safe') startTest('template');
                }}
                recommendations={intelligence.recommendations}
                accountName={account ? accountLabel(account) : null}
                disabled={generating}
              />

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted">{testing ? `Formatos do teste (${styles.length} de até ${MAX_TEST_VARIANTS})` : 'Modelo dos slides'}</p>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={testing} onChange={(e) => toggleTesting(e.target.checked)} disabled={generating} />
                    <FlaskConical className="size-4 text-accent" aria-hidden />
                    Testar formatos
                  </label>
                </div>
                {testing && <p className="mb-3 text-xs text-faint">Marque de 2 a 4 estilos. Cada um vira uma versão com o mesmo texto e as mesmas fotos, pra você postar e comparar na área Testes.</p>}
                <StylePicker
                  label={testing ? 'Formatos do teste' : 'Modelo dos slides'}
                  draft={brand}
                  photo={photo}
                  assets={assets.data}
                  selected={styles}
                  onToggle={toggleStyle}
                  multiple={testing}
                  disabled={generating}
                  shade={shade}
                  account={accountIdentity}
                />
              </div>
              {styles.includes('post') && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">No modelo Post</p>
                  <div role="radiogroup" aria-label="Imagem no modelo Post" className="grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1 sm:max-w-md">
                    <ChoiceCard active={postWithImages} onClick={() => setPostWithImages(true)} title="Com imagem" detail="Foto e @ em cima, frase e foto" />
                    <ChoiceCard active={!postWithImages} onClick={() => setPostWithImages(false)} title="Só texto" detail="Foto e @ em cima, frase no centro" />
                  </div>
                </div>
              )}
              <TestBriefCard
                enabled={testOn}
                onEnabled={(enabled) => (enabled ? startTest(testing ? 'design' : 'horario') : setTestOn(false))}
                onVariables={changeTestVariables}
                brief={testBrief}
                onChange={(patch) => setBrief((current) => ({ ...current, ...patch }))}
                problems={testProblems}
                disabled={generating}
              />
              <div>
                <p className="mb-3 text-xs font-medium text-muted">Sombreamento das fotos (vale pra todas)</p>
                {shadeContext && <ShadePicker context={shadeContext} photo={photo} value={shade} onChange={setShade} disabled={generating} />}
              </div>
              {shadeContext && (
                <div>
                  <p className="mb-3 text-xs font-medium text-muted">Texto dos slides (vale pra todos)</p>
                  <TextStylePanel
                    context={{ ...shadeContext, shade }}
                    photoId={styles[0] === 'post' && !postWithImages ? null : (photo?.id ?? null)}
                    sampleText={sampleText}
                    value={textStyle}
                    onChange={setTextStyle}
                    disabled={generating}
                  />
                </div>
              )}

              {product && (
                <div className="rounded-2xl border border-line p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-start gap-2 text-sm text-ink">
                      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" checked={includeProduct} onChange={(e) => setIncludeProduct(e.target.checked)} disabled={generating} />
                      <span>
                        Mostrar o {product.name} num slide, como parte da solução
                        <span className="block text-xs text-faint">
                        Só entra no slide marcado na copy: SLIDE 6 — PRODUTO, SLIDE 6 — APP ou só SLIDE - APP. Sem marcação, o carrossel sai sem a imagem do produto.
                      </span>
                      </span>
                    </label>
                    {includeProduct && (
                      <div className="flex items-center gap-3 pl-6 sm:pl-0">
                        {productImage ? (
                          <AssetThumb asset={productImage} className="size-14 shrink-0 rounded-lg ring-1 ring-line" />
                        ) : (
                          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-subtle text-faint ring-1 ring-line" aria-hidden>
                            <ImageIcon className="size-5" />
                          </span>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" loading={uploadingProductImage} onClick={() => productFileInput.current?.click()} disabled={generating}>
                            {!uploadingProductImage && <Upload className="size-4" aria-hidden />}
                            Enviar print
                          </Button>
                          {assets.data.length > 0 && (
                            <Button size="sm" variant="secondary" onClick={() => setPickingProductImage(true)} disabled={generating || uploadingProductImage}>
                              {productImage ? 'Trocar' : 'Escolher da biblioteca'}
                            </Button>
                          )}
                        </div>
                        <input
                          ref={productFileInput}
                          type="file"
                          accept={ACCEPTED_IMAGE_TYPES.join(',')}
                          className="hidden"
                          aria-label={`Enviar print do ${product.name}`}
                          onChange={(event) => {
                            void uploadProductImage(event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {includeProduct && (
                    <div role="radiogroup" aria-label={`Como o ${product.name} aparece`} className="mt-4 grid grid-cols-1 gap-1 rounded-2xl bg-subtle p-1 sm:grid-cols-2">
                      {PRODUCT_DISPLAYS.map((display) => (
                        <ChoiceCard
                          key={display}
                          active={productDisplay === display}
                          onClick={() => setProductDisplay(display)}
                          title={PRODUCT_DISPLAY_LABELS[display].title}
                          detail={PRODUCT_DISPLAY_LABELS[display].detail}
                        />
                      ))}
                    </div>
                  )}
                  {includeProduct && productDisplay === 'card' && (
                    <p className="mt-2 text-xs text-faint">
                      Suba o print já cortado no pedaço que importa. A foto de fundo vem da biblioteca, e no editor dá pra mudar o lugar e o tamanho do card.
                    </p>
                  )}
                  <ImagePickerDialog
                    open={pickingProductImage}
                    title={`Imagem do ${product.name}`}
                    assets={assets.data}
                    currentId={productImageId}
                    slideText={`${product.name} ${product.pitch} app tela print produto`}
                    carouselFolders={[]}
                    onPick={(id) => {
                      setProductImageId(id);
                      setPickingProductImage(false);
                    }}
                    onClose={() => setPickingProductImage(false)}
                  />
                </div>
              )}

            </div>
          </Step>

          <Step number={4} title="As fotos do carrossel">
            {folderCounts.size > 0 ? (
              <FolderPicker label="De quais pastas da biblioteca" counts={folderCounts} selected={folders} onChange={setFolders} disabled={generating} />
            ) : (
              <p className="text-sm text-muted">
                Sua biblioteca está vazia, então os slides saem só com texto.{' '}
                <Link to="/biblioteca" className="font-medium text-ink underline underline-offset-4 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  Subir fotos na Biblioteca
                </Link>
              </p>
            )}
            {folderCounts.size > 0 && (
              <p className="mt-2 text-xs text-faint">
                {folders.length > 0
                  ? 'Cada slide ganha uma foto das pastas marcadas: primeiro a que combina com a frase pelas tags, senão outra da pasta. Cada carrossel usa fotos diferentes dos outros. Depois dá pra trocar qualquer uma no editor.'
                  : 'Com "Todas", só entra foto cuja tag combine com a frase; o resto sai só com texto. Pra ter foto em todo slide (como a Ella), marque a pasta das fotos dessa conta.'}
              </p>
            )}
            {folders.length > 0 && knownSlides > availableImages && (
              <div className="mt-3">
                <Alert tone="info">
                  São {availableImages} fotos nessas pastas pra {knownSlides} slides: algumas fotos vão se repetir entre os carrosséis (sempre as menos usadas). Suba mais
                  {' '}{knownSlides - availableImages} fotos na Biblioteca pra cada slide ter a sua.
                </Alert>
              </div>
            )}
          </Step>

          <Step number={5} title="Onde salvar e quando postar">
            <div className="flex flex-col gap-5">
              <NamePicker
                label="Projeto"
                options={knownProjects}
                value={project}
                onChange={(name) => {
                  setProject(name);
                  setFolder('');
                }}
                createLabel="Novo projeto"
                placeholder={`Nome do projeto, ex: ${defaultProject || 'Aura'}`}
                hint={project.trim() ? undefined : `Sem escolher, vai pro projeto "${defaultProject}".`}
                disabled={generating}
              />
              <NamePicker
                key={project.trim() || '__no-project__'}
                label="Pasta"
                options={knownFolders.filter((option) => option.name)}
                value={folder}
                onChange={setFolder}
                createLabel="Nova pasta"
                placeholder="Nome da pasta, ex: Outubro"
                noneLabel="Sem pasta"
                disabled={generating}
              />
            </div>

            <label className="mt-5 flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={scheduling} onChange={(e) => setScheduling(e.target.checked)} disabled={generating} />
              Programar as postagens
            </label>
            {scheduling && (
              <div className="mt-3 flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Começar em" htmlFor="start-date">
                    <Input id="start-date" type="date" value={startDate} min={todayIso()} onChange={(e) => e.target.value && setStartDate(e.target.value)} disabled={generating} />
                  </Field>
                  <Field label="Quantos por dia" htmlFor="per-day">
                    <Select id="per-day" value={effectivePerDay} onChange={(e) => setPerDay(Number(e.target.value))} disabled={generating}>
                      {Array.from({ length: maxPerDay }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>
                          {count} {count === 1 ? 'carrossel' : 'carrosséis'} por dia
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {plannedDays.length > 0 ? (
                  <div className="text-xs" aria-live="polite">
                    <p className="font-medium text-ink">
                      {blocks} {blocks === 1 ? 'carrossel' : 'carrosséis'} · {effectivePerDay} por dia = {plannedDays.length} {plannedDays.length === 1 ? 'dia' : 'dias'}
                      {plannedDays.length > 1 && ` (de ${formatDay(plannedDays[0].date)} a ${formatDay(plannedDays[plannedDays.length - 1].date)})`}
                    </p>
                    <p className="mt-1 text-muted">{plannedDays.map(({ date, count }) => `${formatDay(date)}: ${count}`).join(' · ')}</p>
                  </div>
                ) : (
                  <p className="text-xs text-faint">Cole a copy pra ver como os carrosséis se dividem nos dias. Vários carrosséis de uma vez: separe com --- ou recomece no Slide 1.</p>
                )}
                <p className="text-xs text-faint">Eles aparecem na Agenda, no dia certo, prontos pra baixar.</p>
              </div>
            )}
          </Step>

          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:p-5 sm:items-center sm:justify-between">
            <p className="text-xs text-faint">
              {assets.data.length > 0 ? `${availableImages} imagens disponíveis` : 'Sem imagens na biblioteca: os slides saem só com texto.'}
              {mode === 'ai' && services.ai.engine === 'heuristic' && ' · IA local (sem Claude)'}
              {total > 1 && ` · vai criar ${total} carrosséis`}
            </p>
            <Button variant="primary" size="lg" disabled={!ready || (testing && styles.length < 2) || testProblems.length > 0} loading={generating} onClick={() => void generate()}>
              {!generating && <Sparkles className="size-4" aria-hidden />}
              {testing || testOn ? 'Gerar teste' : total > 1 ? `Gerar ${total} carrosséis` : 'Gerar carrossel'}
              {!generating && <ArrowRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 min-h-12">
        {error && <Alert>{error}</Alert>}
        <AnimatePresence>{generating && <GenerationSteps steps={mode === 'ai' ? AI_STEPS : MANUAL_STEPS} />}</AnimatePresence>
      </div>
      {warnings && <SimilarityDialog warnings={warnings} account={account} onClose={() => setWarnings(null)} onContinue={() => void generate(true)} onNewVersion={(id) => void newVersionOf(id)} />}
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${number}`} className="border-b border-line p-4 last:border-b-0 sm:p-5">
      <h2 id={`step-${number}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid size-6 place-items-center rounded-full bg-ink text-xs font-semibold text-surface" aria-hidden>
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function FormatCard({ format, use, active, onClick, disabled }: { format: CarouselFormat; use: string; active: boolean; onClick: () => void; disabled: boolean }) {
  const { width, height } = FORMAT_SIZES[format];
  const iconHeight = 28;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60',
        active ? 'bg-accent/10 ring-2 ring-accent' : 'ring-1 ring-line hover:ring-faint',
      )}
    >
      <span className="grid w-7 shrink-0 place-items-center" aria-hidden>
        <span className={clsx('block rounded-[3px] border-2', active ? 'border-accent' : 'border-faint')} style={{ height: iconHeight * Math.min(1, height / width / 1.78) + 8, aspectRatio: `${width} / ${height}` }} />
      </span>
      <span className="min-w-0">
        <span className={clsx('block text-sm font-semibold', active ? 'text-ink' : 'text-muted')}>{format}</span>
        <span className="block truncate text-xs text-faint">{use}</span>
        <span className="block text-[11px] text-faint">{formatSizeLabel(format)}</span>
      </span>
    </button>
  );
}

function ChoiceCard({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active ? 'bg-surface shadow-sm ring-1 ring-line' : 'hover:bg-surface/60',
      )}
    >
      <span className={clsx('block text-sm font-medium', active ? 'text-ink' : 'text-muted')}>{title}</span>
      <span className="block text-xs text-faint">{detail}</span>
    </button>
  );
}

function GenerationSteps({ steps }: { steps: string[] }) {
  const [step, setStep] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), 1200);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <motion.ol
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs"
      aria-live="polite"
    >
      {steps.map((label, index) => (
        <li key={label} className={index <= step ? 'text-ink' : 'text-faint'}>
          {index < step ? '✓ ' : index === step ? '• ' : ''}
          {label}
        </li>
      ))}
    </motion.ol>
  );
}

/** Distinct non-empty names with how many carousels use each, alphabetically. */
function namesWithCounts(values: string[]): NameOption[] {
  const counts = new Map<string, number>();
  for (const value of values.map((item) => item.trim()).filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

function countByFolder(assets: { folder: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const asset of assets) counts.set(asset.folder, (counts.get(asset.folder) ?? 0) + 1);
  return new Map([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** In "Já separei" nothing is detected from the text, so "auto" means the type was not set. */
function typeLabel(type: ContentType, manual: boolean): string {
  return type === 'auto' && manual ? 'Não definido' : CONTENT_TYPE_LABELS[type];
}

interface CopyTagsProps {
  index: number;
  setting: CopySetting;
  /** Values written in the copy itself ("Objetivo:", "Tipo:"), which win over the selects. */
  fromScript: { objective: Objective | null; contentType: ContentType | null };
  defaults: { objective: Objective; contentType: ContentType };
  manual: boolean;
  disabled: boolean;
  onChange: (patch: Partial<CopySetting>) => void;
  /** Controle / Variação of this copy, shown while a test compares copies. */
  version: { value: string; onChange: (value: string) => void } | null;
}

/** Objective and type of one copy box, so each carousel of a batch records why it was made. */
function CopyTags({ index, setting, fromScript, defaults, manual, disabled, onChange, version }: CopyTagsProps) {
  const selectClass = '!h-8 !w-auto max-w-full !rounded-lg !py-0 !pl-2 text-xs';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {version && (
        <Select aria-label={`Versão da copy ${index + 1} no teste`} value={version.value} onChange={(e) => version.onChange(e.target.value)} disabled={disabled} className={clsx(selectClass, 'font-medium text-accent')}>
          {VERSION_LABELS.map((label) => (
            <option key={label} value={label}>
              Teste: {label}
            </option>
          ))}
        </Select>
      )}
      {fromScript.objective ? (
        <span className="rounded-lg bg-subtle px-2 py-1 text-xs text-muted" title='Definido pela linha "Objetivo:" da copy'>
          {OBJECTIVE_LABELS[fromScript.objective]} · no texto
        </span>
      ) : (
        <Select
          aria-label={`Objetivo da copy ${index + 1}`}
          value={setting.objective ?? ''}
          onChange={(e) => onChange({ objective: (e.target.value || null) as Objective | null })}
          disabled={disabled}
          className={clsx(selectClass, setting.objective ? 'text-ink' : 'text-faint')}
        >
          <option value="">Objetivo: padrão ({OBJECTIVE_LABELS[defaults.objective]})</option>
          {OBJECTIVES.map((item) => (
            <option key={item} value={item}>
              {OBJECTIVE_LABELS[item]}
            </option>
          ))}
        </Select>
      )}
      {fromScript.contentType ? (
        <span className="rounded-lg bg-subtle px-2 py-1 text-xs text-muted" title='Definido pela linha "Tipo:" da copy'>
          {CONTENT_TYPE_LABELS[fromScript.contentType]} · no texto
        </span>
      ) : (
        <Select
          aria-label={`Tipo da copy ${index + 1}`}
          value={setting.contentType ?? ''}
          onChange={(e) => onChange({ contentType: (e.target.value || null) as ContentType | null })}
          disabled={disabled}
          className={clsx(selectClass, setting.contentType ? 'text-ink' : 'text-faint')}
        >
          <option value="">Tipo: padrão ({typeLabel(defaults.contentType, manual)})</option>
          {CONTENT_TYPES.filter((type) => type !== 'auto').map((type) => (
            <option key={type} value={type}>
              {CONTENT_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
