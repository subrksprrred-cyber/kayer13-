(() => {
  const reducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const memoryIsLimited =
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);

  function showToast(message) {
    const toast = document.getElementById("siteToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(
      () => toast.classList.remove("is-visible"),
      3200,
    );
  }

  function readLocalJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.error(`Could not read local data "${key}".`, error);
      showToast("تعذّر قراءة البيانات المحفوظة محلياً.");
      return fallback;
    }
  }

  function writeLocalJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Could not save local data "${key}".`, error);
      showToast(
        "تعذّر الحفظ في المتصفح. تحقق من مساحة التخزين وإعدادات الخصوصية.",
      );
      return false;
    }
  }

  function weekKey(date) {
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil(
      (((date - yearStart) / 86400000) + yearStart.getDay() + 1) / 7,
    );
    return `${date.getFullYear()}-w${week}`;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch((error) => {
        console.error(
          "Clipboard API failed; trying the compatibility fallback.",
          error,
        );
        return fallbackCopy(text);
      });
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      field.remove();
    }
    if (!copied) {
      return Promise.reject(new Error("The browser did not allow copying."));
    }
    return Promise.resolve();
  }

  async function shareOrCopy(title, text, url) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Native sharing failed.", error);
      }
    }
    try {
      await copyText(`${text} ${url}`);
      showToast("تم نسخ رابط المشاركة.");
    } catch (error) {
      console.error("Could not share or copy the link.", error);
      showToast("تعذّرت المشاركة والنسخ في هذا المتصفح.");
    }
  }

  function openDialog(dialog) {
    if (!dialog || typeof dialog.showModal !== "function") {
      showToast("المتصفح لا يدعم النوافذ المنبثقة الحديثة.");
      return;
    }
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const videoGrid = document.getElementById("videoGrid");
    const videoTags = {
      "BSp35--VY4s": ["arena", "pvp"],
      "tdWTI45WB8g": ["arena", "clan-wars", "pvp"],
      "O0SZh-Lm4V8": ["pvp"],
      "VR9o7hDOYyA": ["pvp"],
      "d4idXHK1Ge0": ["bridging", "pvp"],
      "TCw0X4wmLrU": ["arena", "pvp"],
      "w9Gou1vz6sA": ["pvp"],
      "B4H9-OuEjNc": ["clan-wars", "pvp"],
      "q9-_-FziUAM": ["clan-wars", "pvp"],
      "CC3GvKHcm3c": ["pvp"],
    };
    const tagLabels = {
      arena: "Arena",
      "clan-wars": "Clan Wars",
      pvp: "PvP",
      bridging: "Bridging",
    };
    const originalCards = [];
    const voteWeek = weekKey(new Date());
    const voteStateKey = `sn_video_vote_state_${voteWeek}`;
    let voteState = readLocalJson(voteStateKey, { counts: {}, cast: null });
    if (
      !voteState || typeof voteState !== "object" || Array.isArray(voteState)
    ) {
      console.error("Saved vote state is not in the expected format.");
      voteState = { counts: {}, cast: null };
    }
    if (
      !voteState.counts || typeof voteState.counts !== "object" ||
      Array.isArray(voteState.counts)
    ) {
      console.error("Saved vote counts are not in the expected format.");
      voteState.counts = {};
    }
    const voteCounts = voteState.counts;
    let voteCast = typeof voteState.cast === "string" ? voteState.cast : null;

    function parseVideoId(url) {
      try {
        const parsed = new URL(url, window.location.href);
        const id = parsed.hostname === "youtu.be"
          ? parsed.pathname.split("/").filter(Boolean)[0]
          : parsed.searchParams.get("v");
        return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
      } catch (error) {
        console.error("Invalid video link in the page.", error);
        return null;
      }
    }

    function createActionButton(label, action, videoId) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.videoAction = action;
      button.dataset.videoId = videoId;
      return button;
    }

    if (videoGrid) {
      Array.from(videoGrid.children).forEach((card, index) => {
        const videoLink = card.querySelector(
          'a[href*="youtu.be/"], a[href*="youtube.com/watch"]',
        );
        const titleElement = card.querySelector("h4");
        const thumbnail = card.querySelector(".bg-gray-900.h-36");
        const videoId = videoLink ? parseVideoId(videoLink.href) : null;
        if (!videoId || !titleElement || !thumbnail) {
          console.error(
            "A video card is missing a valid link, title, or thumbnail.",
            card,
          );
          return;
        }

        const title = titleElement.textContent.trim();
        const tags = videoTags[videoId] || ["pvp"];
        const durationElement = card.querySelector(".bottom-2");
        const durationParts = durationElement
          ? durationElement.textContent.trim().split(":").map(Number)
          : [];
        const duration = durationParts.length === 2
          ? durationParts[0] * 60 + durationParts[1]
          : 0;
        card.classList.add("video-card");
        card.dataset.videoId = videoId;
        card.dataset.videoTags = tags.join(" ");
        card.dataset.videoDuration = String(duration);
        originalCards.push({ card, index });

        if (durationElement) durationElement.classList.add("video-duration");
        const playButton = document.createElement("button");
        playButton.type = "button";
        playButton.className = "video-play-trigger";
        playButton.dataset.videoId = videoId;
        playButton.setAttribute("aria-label", `تشغيل: ${title}`);
        const screenReaderLabel = document.createElement("span");
        screenReaderLabel.className = "sr-only";
        screenReaderLabel.textContent = `تشغيل المقطع: ${title}`;
        playButton.appendChild(screenReaderLabel);
        thumbnail.appendChild(playButton);

        const content = card.querySelector(".p-4");
        const tagList = document.createElement("div");
        tagList.className = "flex flex-wrap gap-2 mb-2";
        tags.forEach((tag) => {
          const label = document.createElement("span");
          label.className = "video-tag";
          label.textContent = tagLabels[tag] || tag;
          tagList.appendChild(label);
        });
        content.insertBefore(tagList, titleElement);

        const actions = document.createElement("div");
        actions.className = "video-actions";
        actions.append(
          createActionButton("نسخ الرابط", "copy", videoId),
          createActionButton("مشاركة", "share", videoId),
        );
        const voteButton = createActionButton("", "vote", videoId);
        voteButton.setAttribute(
          "aria-label",
          `التصويت لمقطع ${title}، التصويت محلي لهذا المتصفح`,
        );
        voteButton.textContent = voteCast
          ? (voteCast === videoId ? "صوّت لهذا المقطع" : "انتهى تصويتك الأسبوعي")
          : `تصويت محلي (${Number(voteCounts[videoId]) || 0})`;
        voteButton.disabled = Boolean(voteCast);
        actions.appendChild(voteButton);
        content.appendChild(actions);
      });
    }

    const videoPlayerDialog = document.getElementById("videoPlayerDialog");
    const videoPlayerFrame = document.getElementById("videoPlayerFrame");
    const videoDialogTitle = document.getElementById("videoDialogTitle");

    function playVideo(videoId) {
      const card = originalCards.find((entry) =>
        entry.card.dataset.videoId === videoId
      );
      if (!card || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        showToast("تعذّر فتح هذا المقطع.");
        return;
      }
      const title = card.card.querySelector("h4").textContent.trim();
      videoDialogTitle.textContent = title;
      videoPlayerFrame.title = title;
      videoPlayerFrame.src = `https://www.youtube-nocookie.com/embed/${
        encodeURIComponent(videoId)
      }?autoplay=1&rel=0`;
      openDialog(videoPlayerDialog);
    }

    if (videoPlayerDialog) {
      videoPlayerDialog.addEventListener("close", () => {
        videoPlayerFrame.removeAttribute("src");
      });
    }

    document.addEventListener("click", async (event) => {
      const copyIdButton = event.target.closest("[data-copy-id]");
      if (copyIdButton) {
        try {
          await copyText(copyIdButton.dataset.copyId);
          showToast("تم نسخ ID اللاعب.");
        } catch (error) {
          console.error("Could not copy the player ID.", error);
          showToast("تعذّر نسخ ID.");
        }
        return;
      }

      const closeButton = event.target.closest("[data-dialog-close]");
      if (closeButton) {
        closeDialog(document.getElementById(closeButton.dataset.dialogClose));
        return;
      }

      const playButton = event.target.closest(".video-play-trigger");
      if (playButton) {
        playVideo(playButton.dataset.videoId);
        return;
      }

      const actionButton = event.target.closest("[data-video-action]");
      if (!actionButton) return;
      const videoId = actionButton.dataset.videoId;
      const url = `https://youtu.be/${encodeURIComponent(videoId)}`;

      if (actionButton.dataset.videoAction === "copy") {
        try {
          await copyText(url);
          showToast("تم نسخ رابط المقطع.");
        } catch (error) {
          console.error("Could not copy the video link.", error);
          showToast("تعذّر نسخ الرابط.");
        }
      } else if (actionButton.dataset.videoAction === "share") {
        await shareOrCopy(
          "مقطع من Clan SN",
          "شاهد هذا المقطع من Clan SN:",
          url,
        );
      } else if (actionButton.dataset.videoAction === "vote") {
        if (voteCast) {
          showToast("يمكنك التصويت مرة واحدة أسبوعياً في هذا المتصفح.");
          return;
        }
        voteCounts[videoId] = (Number(voteCounts[videoId]) || 0) + 1;
        voteState = { counts: voteCounts, cast: videoId };
        if (!writeLocalJson(voteStateKey, voteState)) {
          voteCounts[videoId] -= 1;
          voteCast = null;
          return;
        }
        voteCast = videoId;
        videoGrid.querySelectorAll('[data-video-action="vote"]').forEach(
          (button) => {
            button.disabled = true;
            button.textContent = button.dataset.videoId === videoId
              ? `صوّت لهذا المقطع (${Number(voteCounts[videoId]) || 0})`
              : "انتهى تصويتك الأسبوعي";
          },
        );
        showToast("سُجّل تصويت محلي في هذا المتصفح فقط.");
      }
    });

    const searchInput = document.getElementById("videoSearch");
    const filterSelect = document.getElementById("videoFilter");
    const sortSelect = document.getElementById("videoSort");
    const resultsCount = document.getElementById("videoResultsCount");

    function updateVideoList() {
      if (!videoGrid) return;
      const query = searchInput.value.trim().toLocaleLowerCase();
      const selectedTag = filterSelect.value;
      const sorted = originalCards.slice();
      if (sortSelect.value === "shortest") {
        sorted.sort((a, b) =>
          Number(a.card.dataset.videoDuration) -
          Number(b.card.dataset.videoDuration)
        );
      } else if (sortSelect.value === "longest") {
        sorted.sort((a, b) =>
          Number(b.card.dataset.videoDuration) -
          Number(a.card.dataset.videoDuration)
        );
      } else {
        sorted.sort((a, b) => a.index - b.index);
      }
      sorted.forEach(({ card }) => videoGrid.appendChild(card));
      let visible = 0;
      sorted.forEach(({ card }) => {
        const text = `${
          card.querySelector("h4").textContent
        } ${card.dataset.videoTags}`.toLocaleLowerCase();
        const matchesText = !query || text.includes(query);
        const matchesTag = selectedTag === "all" ||
          card.dataset.videoTags.split(" ").includes(selectedTag);
        card.classList.toggle("is-filtered", !(matchesText && matchesTag));
        if (matchesText && matchesTag) visible += 1;
      });
      resultsCount.textContent =
        `عرض ${visible} من ${originalCards.length} مقاطع`;
    }

    [searchInput, filterSelect, sortSelect].forEach((control) => {
      if (!control) return;
      control.addEventListener(
        control === searchInput ? "input" : "change",
        updateVideoList,
      );
    });
    updateVideoList();

    const clipDialog = document.getElementById("clipSubmissionDialog");
    const clipForm = document.getElementById("clipSubmissionForm");
    const clipList = document.getElementById("localClipList");
    const clipMessage = document.getElementById("clipFormMessage");
    const clipStorageKey = "sn_local_clip_suggestions";

    function normalizeYouTubeUrl(value) {
      try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        if (
          parsed.protocol !== "https:" ||
          !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]
            .includes(host)
        ) return null;
        const parts = parsed.pathname.split("/").filter(Boolean);
        const id = host === "youtu.be"
          ? parts[0]
          : (parsed.searchParams.get("v") || parts[1]);
        if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
        return { id, url: `https://youtu.be/${id}` };
      } catch {
        return null;
      }
    }

    function renderLocalClips() {
      const clips = readLocalJson(clipStorageKey, []);
      clipList.replaceChildren();
      if (!Array.isArray(clips)) {
        console.error("Saved clip suggestions are not in the expected format.");
        showToast("توجد بيانات مقترحات غير صالحة في التخزين المحلي.");
        return;
      }
      clips.forEach((clip) => {
        const safeLink = clip && typeof clip.url === "string"
          ? normalizeYouTubeUrl(clip.url)
          : null;
        if (!safeLink || typeof clip.creator !== "string") return;
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = safeLink.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "text-snAccent hover:underline";
        link.textContent = `${clip.creator} — ${safeLink.id}`;
        item.appendChild(link);
        clipList.appendChild(item);
      });
    }

    const openClipButton = document.getElementById("openClipDialog");
    if (openClipButton) {
      openClipButton.addEventListener("click", () => openDialog(clipDialog));
    }
    if (clipForm) {
      clipForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const creator = document.getElementById("clipCreatorName").value.trim();
        const video = normalizeYouTubeUrl(
          document.getElementById("clipVideoUrl").value.trim(),
        );
        if (!creator || !video) {
          clipMessage.textContent = "أدخل اسماً ورابط يوتيوب صالحاً.";
          clipMessage.className = "text-sm text-red-400";
          return;
        }
        const clips = readLocalJson(clipStorageKey, []);
        if (!Array.isArray(clips)) {
          clipMessage.textContent = "تعذّر تحميل قائمة المقاطع المحفوظة.";
          clipMessage.className = "text-sm text-red-400";
          return;
        }
        clips.unshift({
          creator,
          url: video.url,
          savedAt: new Date().toISOString(),
        });
        if (!writeLocalJson(clipStorageKey, clips.slice(0, 20))) return;
        renderLocalClips();
        clipMessage.textContent =
          "حُفظ المقطع في هذا المتصفح فقط؛ لم يُرسل أو يُنشر.";
        clipMessage.className = "text-sm text-green-300";
        clipForm.reset();
      });
    }
    renderLocalClips();

    const quizForm = document.getElementById("playerQuiz");
    const quizResult = document.getElementById("quizResult");
    const quizShare = document.getElementById("shareQuizResult");
    const playerByStyle = {
      strategy: { name: "KAYER", description: "أسلوب التخطيط وقيادة الفريق." },
      bridge: { name: "Bridger", description: "أسلوب البناء والـ Bridging." },
      rush: { name: "Madox", description: "أسلوب الهجوم السريع وPvP." },
      defense: { name: "Killer", description: "أسلوب الدفاع والقتال الجماعي." },
      support: { name: "Fahed", description: "أسلوب المساندة والتنسيق." },
    };
    let lastQuizText = "";
    if (quizForm) {
      quizForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const scores = {
          strategy: 0,
          bridge: 0,
          rush: 0,
          defense: 0,
          support: 0,
        };
        new FormData(quizForm).forEach((value) => {
          if (Object.prototype.hasOwnProperty.call(scores, value)) {
            scores[value] += 1;
          }
        });
        const winner = Object.keys(scores).reduce(
          (best, style) => scores[style] > scores[best] ? style : best,
          "strategy",
        );
        const result = playerByStyle[winner];
        lastQuizText =
          `نتيجة كويز SN: أنا أقرب إلى ${result.name} — ${result.description}`;
        quizResult.textContent =
          `أنت أقرب إلى ${result.name}! ${result.description}`;
        quizShare.classList.remove("hidden");
      });
    }
    if (quizShare) {
      quizShare.addEventListener("click", () => {
        if (lastQuizText) {
          shareOrCopy("نتيجة كويز SN", lastQuizText, window.location.href);
        }
      });
    }

    document.querySelectorAll(".site-dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });

    const memberDialog = document.getElementById("memberDetailsDialog");
    const memberDialogTitle = document.getElementById("memberDialogTitle");
    const memberDialogDescription = document.getElementById(
      "memberDialogDescription",
    );
    const memberDialogRole = document.getElementById("memberDialogRole");

    function addDetailsButton(row, title, description, role) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "member-details-button";
      button.textContent = "التفاصيل";
      button.setAttribute("aria-label", `عرض تفاصيل ${title}`);
      button.addEventListener("click", () => {
        memberDialogTitle.textContent = title;
        memberDialogDescription.textContent = description;
        memberDialogRole.textContent = role;
        openDialog(memberDialog);
      });
      row.appendChild(button);
    }

    document.querySelectorAll("#abuser-ranking .divide-y > div").forEach(
      (row) => {
        const nameElement = row.querySelector("h4");
        if (!nameElement) return;
        const name = nameElement.textContent.trim();
        const idDescription = Array.from(row.querySelectorAll("span")).find((
          span,
        ) => /^ID:\s*\d+/.test(span.textContent.trim()));
        const description = idDescription
          ? idDescription.textContent.replace(/^ID:\s*\d+\s*[•-]?\s*/, "")
            .trim()
          : "عضو في قائمة أبطال SN.";
        const match = idDescription &&
          idDescription.textContent.match(/ID:\s*(\d+)/);
        if (match) {
          const copyButton = document.createElement("button");
          copyButton.type = "button";
          copyButton.className = "copy-id-button";
          copyButton.textContent = "نسخ ID";
          copyButton.dataset.copyId = match[1];
          idDescription.append(" ");
          idDescription.appendChild(copyButton);
        }
        const role = name === "SN-KAYER"
          ? "قائد العشيرة"
          : name === "SN-Bridger"
          ? "شريك وقائد للفريق"
          : "عضو في ترتيب الأبطال";
        addDetailsButton(row, name, description, role);
      },
    );

    document.querySelectorAll("#top-clans .divide-y > div").forEach((row) => {
      const nameElement = row.querySelector("h4");
      if (!nameElement) return;
      const name = nameElement.textContent.trim();
      const description = Array.from(row.querySelectorAll("span"))
        .map((span) => span.textContent.trim())
        .filter((text) => text && text !== "كلان معتمد")
        .join(" — ");
      addDetailsButton(
        row,
        name,
        description || `معلومات ${name} كما وردت في قائمة الكلانات.`,
        "كلان ضمن قائمة Top 5 المعروضة في الصفحة",
      );
    });

    const weeklyPlayers = [
      ["SN-KAYER", "القائد المذكور في بطاقة ترتيب الأعضاء."],
      ["SN-Bridger", "محترف Bed Wars كما يصفه الموقع."],
      ["SN-Madox", "أسلوب هجومي كما يصفه ترتيب الأعضاء."],
      ["SN-Killer", "خبير الدفاع والقتال الجماعي بحسب البطاقة."],
      ["SN-Fahed", "استراتيجي الفريق بحسب البطاقة."],
    ];
    const weekNumber = Number(weekKey(new Date()).split("-w")[1]) || 1;
    const weeklyPlayer = weeklyPlayers[(weekNumber - 1) % weeklyPlayers.length];
    document.getElementById("weeklyPlayerName").textContent = weeklyPlayer[0];
    document.getElementById("weeklyPlayerSummary").textContent = `${
      weeklyPlayer[1]
    } يتبدل الاختيار تلقائياً كل أسبوع على هذا الجهاز.`;

    const countdown = document.getElementById("eventCountdown");
    function updateCountdown() {
      const now = new Date();
      const target = new Date(now);
      const daysUntilFriday = (5 - now.getDay() + 7) % 7;
      target.setDate(now.getDate() + daysUntilFriday);
      target.setHours(20, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 7);
      const remaining = Math.max(0, target.getTime() - now.getTime());
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      countdown.textContent =
        `${days} يوم، ${hours} ساعة، ${minutes} دقيقة، ${seconds} ثانية`;
    }
    updateCountdown();
    window.setInterval(updateCountdown, 1000);

    const counterElements = document.querySelectorAll("[data-count-target]");
    function finishCounter(element) {
      element.textContent = `${element.dataset.countTarget}${
        element.dataset.countSuffix || ""
      }`;
    }
    if (reducedMotion || !("IntersectionObserver" in window)) {
      counterElements.forEach(finishCounter);
    } else {
      const counterObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target;
          const target = Number(element.dataset.countTarget);
          const startTime = performance.now();
          const duration = 1100;
          function animate(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            element.textContent = `${Math.floor(target * progress)}${
              element.dataset.countSuffix || ""
            }`;
            if (progress < 1) window.requestAnimationFrame(animate);
            else finishCounter(element);
          }
          window.requestAnimationFrame(animate);
          observer.unobserve(element);
        });
      }, { threshold: 0.6 });
      counterElements.forEach((element) => counterObserver.observe(element));
    }

    const scrollProgress = document.getElementById("scrollProgress");
    function updateScrollProgress() {
      const scrollable = document.documentElement.scrollHeight -
        window.innerHeight;
      const progress = scrollable > 0
        ? Math.min(window.scrollY / scrollable, 1)
        : 0;
      scrollProgress.style.width = `${progress * 100}%`;
    }
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", updateScrollProgress);
    updateScrollProgress();

    if (!reducedMotion && "IntersectionObserver" in window) {
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.12 });
      document.querySelectorAll(
        "#community-tools, #story, #community-records, #abuser-ranking, #top-clans, #videos-showcase",
      ).forEach((section) => {
        section.classList.add("scroll-reveal");
        revealObserver.observe(section);
      });
    }

    if (
      !reducedMotion && !memoryIsLimited &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      document.querySelectorAll(
        ".video-card, #channels .grid > div, #abuser-ranking .divide-y > div",
      ).forEach((card) => {
        card.classList.add("tilt-card");
        card.addEventListener("pointermove", (event) => {
          const bounds = card.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width;
          const y = (event.clientY - bounds.top) / bounds.height;
          card.style.setProperty("--tilt-x", `${(0.5 - y) * 3}deg`);
          card.style.setProperty("--tilt-y", `${(x - 0.5) * 3}deg`);
        });
        card.addEventListener("pointerleave", () => {
          card.style.setProperty("--tilt-x", "0deg");
          card.style.setProperty("--tilt-y", "0deg");
        });
      });
    }

    if (!reducedMotion && !memoryIsLimited) {
      const canvas = document.getElementById("starsCanvas");
      const context = canvas && canvas.getContext("2d");
      if (canvas && context) {
        const starCount = Math.min(
          90,
          Math.max(30, Math.floor(window.innerWidth / 14)),
        );
        const stars = Array.from({ length: starCount }, () => ({
          x: Math.random(),
          y: Math.random(),
          radius: Math.random() * 1.4 + 0.3,
          speed: Math.random() * 0.0007 + 0.0002,
          alpha: Math.random() * 0.5 + 0.2,
        }));
        let canvasWidth = 0;
        let canvasHeight = 0;
        let starsFrame = 0;
        const resizeCanvas = () => {
          const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
          canvasWidth = window.innerWidth;
          canvasHeight = window.innerHeight;
          canvas.width = Math.floor(canvasWidth * ratio);
          canvas.height = Math.floor(canvasHeight * ratio);
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };
        const drawStars = () => {
          context.clearRect(0, 0, canvasWidth, canvasHeight);
          stars.forEach((star) => {
            star.y += star.speed;
            if (star.y > 1) star.y = 0;
            context.globalAlpha = star.alpha;
            context.fillStyle = "#dbeafe";
            context.beginPath();
            context.arc(
              star.x * canvasWidth,
              star.y * canvasHeight,
              star.radius,
              0,
              Math.PI * 2,
            );
            context.fill();
          });
          context.globalAlpha = 1;
          if (document.visibilityState === "visible") {
            starsFrame = window.requestAnimationFrame(drawStars);
          } else {
            starsFrame = 0;
          }
        };
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas, { passive: true });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden" && starsFrame) {
            window.cancelAnimationFrame(starsFrame);
            starsFrame = 0;
          } else if (document.visibilityState === "visible" && !starsFrame) {
            drawStars();
          }
        });
        drawStars();
      }
    }

    const brand = document.querySelector(".site-brand");
    let logoClicks = 0;
    let logoResetTimer;
    if (brand) {
      brand.addEventListener("click", () => {
        logoClicks += 1;
        window.clearTimeout(logoResetTimer);
        if (logoClicks >= 5) {
          logoClicks = 0;
          showToast(
            "سر زحل: أفضل الانتصارات تبدأ باللعب النظيف والعمل الجماعي. 🪐",
          );
        } else {
          logoResetTimer = window.setTimeout(() => {
            logoClicks = 0;
          }, 2500);
        }
      });
    }
    const konamiSequence = [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ];
    let keySequence = [];
    document.addEventListener("keydown", (event) => {
      keySequence.push(
        event.key.length === 1 ? event.key.toLowerCase() : event.key,
      );
      keySequence = keySequence.slice(-konamiSequence.length);
      if (konamiSequence.every((key, index) => key === keySequence[index])) {
        keySequence = [];
        showToast("اكتشفت سر زحل! حافظ على روح الفريق واللعب النظيف. ✨");
      }
    });

    const soundToggle = document.getElementById("soundToggle");
    let soundEnabled = false;
    let audioContext = null;
    if (soundToggle) {
      soundToggle.addEventListener("click", () => {
        soundEnabled = !soundEnabled;
        soundToggle.textContent = soundEnabled ? "الصوت: يعمل" : "الصوت: مغلق";
        soundToggle.setAttribute("aria-pressed", String(soundEnabled));
        if (soundEnabled) playUiTone();
      });
    }
    function playUiTone() {
      if (!soundEnabled) return;
      try {
        const AudioContextConstructor = window.AudioContext ||
          window.webkitAudioContext;
        if (!AudioContextConstructor) {
          throw new Error("Web Audio is not supported.");
        }
        audioContext = audioContext || new AudioContextConstructor();
        if (audioContext.state === "suspended") {
          audioContext.resume().catch((error) => {
            console.error("Could not resume the optional UI sound.", error);
            soundEnabled = false;
            soundToggle.textContent = "الصوت: مغلق";
            soundToggle.setAttribute("aria-pressed", "false");
          });
        }
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.035, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          audioContext.currentTime + 0.07,
        );
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.08);
      } catch (error) {
        console.error("Optional UI sound could not be played.", error);
        soundEnabled = false;
        soundToggle.textContent = "الصوت: مغلق";
        soundToggle.setAttribute("aria-pressed", "false");
        showToast("تعذّر تشغيل الصوت في هذا المتصفح.");
      }
    }
    document.addEventListener("click", (event) => {
      if (soundEnabled && !event.target.closest("#soundToggle")) playUiTone();
    });

    let deferredInstallPrompt = null;
    const installButton = document.getElementById("installAppButton");
    if (installButton) {
      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        installButton.classList.remove("hidden");
      });
      installButton.addEventListener("click", async () => {
        if (!deferredInstallPrompt) {
          showToast("يمكن تثبيت الموقع من قائمة المتصفح عند دعم ذلك.");
          return;
        }
        try {
          deferredInstallPrompt.prompt();
          await deferredInstallPrompt.userChoice;
        } catch (error) {
          console.error("Could not show the install prompt.", error);
          showToast("تعذّر فتح نافذة تثبيت الموقع.");
        } finally {
          deferredInstallPrompt = null;
          installButton.classList.add("hidden");
        }
      });
      window.addEventListener("appinstalled", () => {
        installButton.classList.add("hidden");
        showToast("تم تثبيت موقع SN.");
      });
    }

    if (
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" ||
        window.location.hostname === "localhost")
    ) {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.error("Service worker registration failed.", error);
      });
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SportsTeam",
          name: "Clan SN",
          sport: "Blockman Go",
          url: "https://www.sn.bg/",
          sameAs: [
            "https://www.youtube.com/@bridgerbg",
            "https://www.youtube.com/results?search_query=%40KAYER_BG",
          ],
        },
        {
          "@type": "ItemList",
          name: "مقاطع Clan SN",
          itemListElement: originalCards.map(({ card }, index) => {
            const id = card.dataset.videoId;
            const title = card.querySelector("h4").textContent.trim();
            return {
              "@type": "ListItem",
              position: index + 1,
              item: {
                "@type": "VideoObject",
                name: title,
                description: title,
                thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
                embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
                contentUrl: `https://youtu.be/${id}`,
              },
            };
          }),
        },
      ],
    };
    const structuredDataScript = document.createElement("script");
    structuredDataScript.type = "application/ld+json";
    structuredDataScript.textContent = JSON.stringify(structuredData);
    document.head.appendChild(structuredDataScript);
  });
})();
