// Medium Publication Discovery
// Search, enrich, display, and export publication data

(function () {
  "use strict";

  const TAG = "[Publication Discovery]";
  const SEARCH_PAGE_SIZE = 25;
  const DETAIL_BATCH_SIZE = 10;
  const DELAY_MS = 400;

  // --- GraphQL Queries ---

  // Exact full SearchQuery from Medium's web app (all fragments required).
  // The @skip/@include directives + boolean variables control which entity types are returned.
  const SEARCH_QUERY = "query SearchQuery($query: String!, $pagingOptions: SearchPagingOptions!, $searchInCollection: Boolean!, $collectionDomainOrSlug: String!, $withUsers: Boolean!, $withTags: Boolean!, $withPosts: Boolean!, $withCollections: Boolean!, $withLists: Boolean!, $peopleSearchOptions: SearchOptions, $postsSearchOptions: SearchOptions, $tagsSearchOptions: SearchOptions, $publicationsSearchOptions: SearchOptions, $listsSearchOptions: SearchOptions) {\n  search(query: $query) @skip(if: $searchInCollection) {\n    __typename\n    ...Search_search\n  }\n  searchInCollection(query: $query, domainOrSlug: $collectionDomainOrSlug) @include(if: $searchInCollection) {\n    __typename\n    ...Search_search\n  }\n}\n\nfragment userUrl_user on User {\n  __typename\n  id\n  customDomainState {\n    live {\n      domain\n      __typename\n    }\n    __typename\n  }\n  hasSubdomain\n  username\n}\n\nfragment UserAvatar_user on User {\n  __typename\n  id\n  imageId\n  membership {\n    tier\n    __typename\n    id\n  }\n  name\n  username\n  ...userUrl_user\n}\n\nfragment isUserVerifiedBookAuthor_user on User {\n  verifications {\n    isBookAuthor\n    __typename\n  }\n  __typename\n  id\n}\n\nfragment SignInOptions_user on User {\n  id\n  name\n  imageId\n  __typename\n}\n\nfragment SignUpOptions_user on User {\n  id\n  name\n  imageId\n  __typename\n}\n\nfragment SusiModal_user on User {\n  ...SignInOptions_user\n  ...SignUpOptions_user\n  __typename\n  id\n}\n\nfragment useNewsletterV3Subscription_newsletterV3 on NewsletterV3 {\n  id\n  type\n  slug\n  name\n  collection {\n    slug\n    __typename\n    id\n  }\n  user {\n    id\n    name\n    username\n    newsletterV3 {\n      id\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment useNewsletterV3Subscription_user on User {\n  id\n  username\n  newsletterV3 {\n    ...useNewsletterV3Subscription_newsletterV3\n    __typename\n    id\n  }\n  __typename\n}\n\nfragment useAuthorFollowSubscribeButton_user on User {\n  id\n  name\n  ...useNewsletterV3Subscription_user\n  __typename\n}\n\nfragment useAuthorFollowSubscribeButton_newsletterV3 on NewsletterV3 {\n  id\n  name\n  ...useNewsletterV3Subscription_newsletterV3\n  __typename\n}\n\nfragment AuthorFollowSubscribeButton_user on User {\n  id\n  name\n  imageId\n  ...SusiModal_user\n  ...useAuthorFollowSubscribeButton_user\n  newsletterV3 {\n    id\n    ...useAuthorFollowSubscribeButton_newsletterV3\n    __typename\n  }\n  __typename\n}\n\nfragment UserFollowInline_user on User {\n  id\n  name\n  bio\n  mediumMemberAt\n  ...UserAvatar_user\n  ...userUrl_user\n  ...isUserVerifiedBookAuthor_user\n  ...AuthorFollowSubscribeButton_user\n  __typename\n}\n\nfragment SearchPeople_people on SearchPeople {\n  items {\n    __typename\n    ... on User {\n      algoliaObjectId\n      __typename\n      id\n    }\n    ...UserFollowInline_user\n  }\n  queryId\n  __typename\n}\n\nfragment TopicPill_tag on Tag {\n  __typename\n  id\n  displayTitle\n  normalizedTagSlug\n}\n\nfragment SearchTags_tags on SearchTag {\n  items {\n    id\n    algoliaObjectId\n    ...TopicPill_tag\n    __typename\n  }\n  queryId\n  __typename\n}\n\nfragment useExplicitSignal_post on Post {\n  id\n  viewerEdge {\n    id\n    explicitSignalState\n    __typename\n  }\n  __typename\n}\n\nfragment ExplicitSignalModal_publisher on Publisher {\n  __typename\n  id\n  name\n}\n\nfragment ExplicitSignalModal_post on Post {\n  id\n  creator {\n    id\n    ...ExplicitSignalModal_publisher\n    viewerEdge {\n      id\n      isMuting\n      __typename\n    }\n    __typename\n  }\n  collection {\n    id\n    ...ExplicitSignalModal_publisher\n    viewerEdge {\n      id\n      isMuting\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment ExplicitSignalContext_post on Post {\n  ...useExplicitSignal_post\n  ...ExplicitSignalModal_post\n  __typename\n  id\n}\n\nfragment StreamPostPreviewImage_imageMetadata on ImageMetadata {\n  id\n  focusPercentX\n  focusPercentY\n  alt\n  __typename\n}\n\nfragment StreamPostPreviewImage_post on Post {\n  title\n  previewImage {\n    ...StreamPostPreviewImage_imageMetadata\n    __typename\n    id\n  }\n  __typename\n  id\n}\n\nfragment SusiModal_post on Post {\n  id\n  creator {\n    id\n    __typename\n  }\n  __typename\n}\n\nfragment SusiClickable_post on Post {\n  id\n  mediumUrl\n  ...SusiModal_post\n  __typename\n}\n\nfragment AddToCatalogBase_post on Post {\n  id\n  isPublished\n  ...SusiClickable_post\n  __typename\n}\n\nfragment AddToCatalogBookmarkButton_post on Post {\n  ...AddToCatalogBase_post\n  __typename\n  id\n}\n\nfragment BookmarkButton_post on Post {\n  visibility\n  ...SusiClickable_post\n  ...AddToCatalogBookmarkButton_post\n  __typename\n  id\n}\n\nfragment FollowMenuOptions_user on User {\n  id\n  ...AuthorFollowSubscribeButton_user\n  __typename\n}\n\nfragment SignInOptions_collection on Collection {\n  id\n  name\n  __typename\n}\n\nfragment SignUpOptions_collection on Collection {\n  id\n  name\n  __typename\n}\n\nfragment SusiModal_collection on Collection {\n  name\n  ...SignInOptions_collection\n  ...SignUpOptions_collection\n  __typename\n  id\n}\n\nfragment PublicationFollowButton_collection on Collection {\n  id\n  slug\n  name\n  ...SusiModal_collection\n  __typename\n}\n\nfragment FollowMenuOptions_collection on Collection {\n  id\n  ...PublicationFollowButton_collection\n  __typename\n}\n\nfragment MultiVoteCount_post on Post {\n  id\n  __typename\n}\n\nfragment ClapMutation_post on Post {\n  __typename\n  id\n  clapCount\n  ...MultiVoteCount_post\n}\n\nfragment OverflowMenuItemUndoClaps_post on Post {\n  id\n  clapCount\n  ...ClapMutation_post\n  __typename\n}\n\nfragment ExplicitSignalMenuOptions_post on Post {\n  ...ExplicitSignalModal_post\n  __typename\n  id\n}\n\nfragment OverflowMenu_post on Post {\n  id\n  creator {\n    id\n    ...FollowMenuOptions_user\n    __typename\n  }\n  collection {\n    id\n    ...FollowMenuOptions_collection\n    __typename\n  }\n  ...OverflowMenuItemUndoClaps_post\n  ...AddToCatalogBase_post\n  ...ExplicitSignalMenuOptions_post\n  __typename\n}\n\nfragment OverflowMenuButton_post on Post {\n  id\n  visibility\n  ...OverflowMenu_post\n  __typename\n}\n\nfragment ShowLessButton_post on Post {\n  ...useExplicitSignal_post\n  ...ExplicitSignalModal_post\n  __typename\n  id\n}\n\nfragment PostPreviewFooterMenu_post on Post {\n  id\n  ...BookmarkButton_post\n  ...OverflowMenuButton_post\n  ...ShowLessButton_post\n  __typename\n}\n\nfragment usePostPublishedAt_post on Post {\n  firstPublishedAt\n  latestPublishedAt\n  pinnedAt\n  __typename\n  id\n}\n\nfragment Star_post on Post {\n  id\n  __typename\n}\n\nfragment PostPreviewFooterMeta_post on Post {\n  isLocked\n  postResponses {\n    count\n    __typename\n  }\n  ...usePostPublishedAt_post\n  ...Star_post\n  __typename\n  id\n}\n\nfragment PostPreviewFooter_post on Post {\n  ...PostPreviewFooterMenu_post\n  ...PostPreviewFooterMeta_post\n  __typename\n  id\n}\n\nfragment PostPreviewBylineAuthorAvatar_user on User {\n  ...UserAvatar_user\n  __typename\n  id\n}\n\nfragment UserLink_user on User {\n  ...userUrl_user\n  __typename\n  id\n}\n\nfragment UserName_user on User {\n  id\n  name\n  ...isUserVerifiedBookAuthor_user\n  ...UserLink_user\n  __typename\n}\n\nfragment PostPreviewByLineAuthor_user on User {\n  ...PostPreviewBylineAuthorAvatar_user\n  ...UserName_user\n  __typename\n  id\n}\n\nfragment collectionUrl_collection on Collection {\n  id\n  domain\n  slug\n  __typename\n}\n\nfragment CollectionAvatar_collection on Collection {\n  name\n  avatar {\n    id\n    __typename\n  }\n  ...collectionUrl_collection\n  __typename\n  id\n}\n\nfragment EntityPresentationRankedModulePublishingTracker_entity on RankedModulePublishingEntity {\n  __typename\n  ... on Collection {\n    id\n    __typename\n  }\n  ... on User {\n    id\n    __typename\n  }\n}\n\nfragment CollectionTooltip_collection on Collection {\n  id\n  name\n  slug\n  description\n  subscriberCount\n  customStyleSheet {\n    header {\n      backgroundImage {\n        id\n        __typename\n      }\n      __typename\n    }\n    __typename\n    id\n  }\n  ...CollectionAvatar_collection\n  ...PublicationFollowButton_collection\n  ...EntityPresentationRankedModulePublishingTracker_entity\n  __typename\n}\n\nfragment CollectionLinkWithPopover_collection on Collection {\n  name\n  ...collectionUrl_collection\n  ...CollectionTooltip_collection\n  __typename\n  id\n}\n\nfragment PostPreviewByLineCollection_collection on Collection {\n  ...CollectionAvatar_collection\n  ...CollectionTooltip_collection\n  ...CollectionLinkWithPopover_collection\n  __typename\n  id\n}\n\nfragment PostPreviewByLine_post on Post {\n  creator {\n    ...PostPreviewByLineAuthor_user\n    __typename\n    id\n  }\n  collection {\n    ...PostPreviewByLineCollection_collection\n    __typename\n    id\n  }\n  __typename\n  id\n}\n\nfragment PostPreviewInformation_post on Post {\n  readingTime\n  isLocked\n  ...Star_post\n  ...usePostPublishedAt_post\n  __typename\n  id\n}\n\nfragment StreamPostPreviewContent_post on Post {\n  id\n  title\n  previewImage {\n    id\n    __typename\n  }\n  extendedPreviewContent {\n    subtitle\n    __typename\n  }\n  ...StreamPostPreviewImage_post\n  ...PostPreviewFooter_post\n  ...PostPreviewByLine_post\n  ...PostPreviewInformation_post\n  __typename\n}\n\nfragment PostScrollTracker_post on Post {\n  id\n  collection {\n    id\n    __typename\n  }\n  sequence {\n    sequenceId\n    __typename\n  }\n  __typename\n}\n\nfragment usePostUrl_post on Post {\n  id\n  creator {\n    ...userUrl_user\n    __typename\n    id\n  }\n  collection {\n    id\n    domain\n    slug\n    __typename\n  }\n  isSeries\n  mediumUrl\n  sequence {\n    slug\n    __typename\n  }\n  uniqueSlug\n  __typename\n}\n\nfragment PostPreviewContainer_post on Post {\n  id\n  extendedPreviewContent {\n    isFullContent\n    __typename\n  }\n  visibility\n  pinnedAt\n  ...PostScrollTracker_post\n  ...usePostUrl_post\n  __typename\n}\n\nfragment StreamPostPreview_post on Post {\n  id\n  ...ExplicitSignalContext_post\n  ...StreamPostPreviewContent_post\n  ...PostPreviewContainer_post\n  __typename\n}\n\nfragment SearchPosts_posts on SearchPost {\n  items {\n    id\n    algoliaObjectId\n    ...StreamPostPreview_post\n    __typename\n  }\n  queryId\n  __typename\n}\n\nfragment CollectionFollowInline_collection on Collection {\n  __typename\n  id\n  name\n  domain\n  shortDescription\n  slug\n  ...CollectionAvatar_collection\n  ...PublicationFollowButton_collection\n}\n\nfragment usePublicationSearchResultClickTracker_collection on Collection {\n  id\n  algoliaObjectId\n  domain\n  slug\n  __typename\n}\n\nfragment SearchCollections_collection on Collection {\n  id\n  ...CollectionFollowInline_collection\n  ...usePublicationSearchResultClickTracker_collection\n  __typename\n}\n\nfragment SearchCollections_collections on SearchCollection {\n  items {\n    ...SearchCollections_collection\n    __typename\n  }\n  queryId\n  __typename\n}\n\nfragment getCatalogSlugId_Catalog on Catalog {\n  id\n  name\n  __typename\n}\n\nfragment formatItemsCount_catalog on Catalog {\n  postItemsCount\n  __typename\n  id\n}\n\nfragment PreviewCatalogCovers_catalogItemV2 on CatalogItemV2 {\n  catalogItemId\n  entity {\n    __typename\n    ... on Post {\n      visibility\n      previewImage {\n        id\n        alt\n        __typename\n      }\n      __typename\n      id\n    }\n  }\n  __typename\n}\n\nfragment CatalogsListItemCovers_catalog on Catalog {\n  listItemsConnection: itemsConnection(pagingOptions: {limit: 10}) {\n    items {\n      catalogItemId\n      ...PreviewCatalogCovers_catalogItemV2\n      __typename\n    }\n    __typename\n  }\n  __typename\n  id\n}\n\nfragment catalogUrl_catalog on Catalog {\n  id\n  predefined\n  ...getCatalogSlugId_Catalog\n  creator {\n    ...userUrl_user\n    __typename\n    id\n  }\n  __typename\n}\n\nfragment CatalogContentNonCreatorMenu_catalog on Catalog {\n  id\n  viewerEdge {\n    clapCount\n    __typename\n    id\n  }\n  ...catalogUrl_catalog\n  __typename\n}\n\nfragment UpdateCatalogDialog_catalog on Catalog {\n  id\n  name\n  description\n  visibility\n  type\n  __typename\n}\n\nfragment CatalogContentCreatorMenu_catalog on Catalog {\n  id\n  visibility\n  name\n  description\n  type\n  postItemsCount\n  predefined\n  disallowResponses\n  creator {\n    ...userUrl_user\n    __typename\n    id\n  }\n  ...UpdateCatalogDialog_catalog\n  ...catalogUrl_catalog\n  __typename\n}\n\nfragment CatalogContentMenu_catalog on Catalog {\n  creator {\n    ...userUrl_user\n    __typename\n    id\n  }\n  ...CatalogContentNonCreatorMenu_catalog\n  ...CatalogContentCreatorMenu_catalog\n  __typename\n  id\n}\n\nfragment SaveCatalogButton_catalog on Catalog {\n  id\n  creator {\n    id\n    username\n    __typename\n  }\n  viewerEdge {\n    id\n    isFollowing\n    __typename\n  }\n  ...getCatalogSlugId_Catalog\n  __typename\n}\n\nfragment CatalogsListItem_catalog on Catalog {\n  id\n  name\n  predefined\n  visibility\n  creator {\n    imageId\n    name\n    ...userUrl_user\n    ...isUserVerifiedBookAuthor_user\n    __typename\n    id\n  }\n  ...getCatalogSlugId_Catalog\n  ...formatItemsCount_catalog\n  ...CatalogsListItemCovers_catalog\n  ...CatalogContentMenu_catalog\n  ...SaveCatalogButton_catalog\n  __typename\n}\n\nfragment SearchLists_catalogs on SearchCatalog {\n  items {\n    id\n    algoliaObjectId\n    ...CatalogsListItem_catalog\n    __typename\n  }\n  queryId\n  __typename\n}\n\nfragment Search_search on Search {\n  people(pagingOptions: $pagingOptions, algoliaOptions: $peopleSearchOptions) @include(if: $withUsers) {\n    ... on SearchPeople {\n      pagingInfo {\n        next {\n          limit\n          page\n          __typename\n        }\n        __typename\n      }\n      ...SearchPeople_people\n      __typename\n    }\n    __typename\n  }\n  tags(pagingOptions: $pagingOptions, algoliaOptions: $tagsSearchOptions) @include(if: $withTags) {\n    ... on SearchTag {\n      pagingInfo {\n        next {\n          limit\n          page\n          __typename\n        }\n        __typename\n      }\n      ...SearchTags_tags\n      __typename\n    }\n    __typename\n  }\n  posts(pagingOptions: $pagingOptions, algoliaOptions: $postsSearchOptions) @include(if: $withPosts) {\n    ... on SearchPost {\n      pagingInfo {\n        next {\n          limit\n          page\n          __typename\n        }\n        __typename\n      }\n      ...SearchPosts_posts\n      __typename\n    }\n    __typename\n  }\n  collections(\n    pagingOptions: $pagingOptions\n    algoliaOptions: $publicationsSearchOptions\n  ) @include(if: $withCollections) {\n    ... on SearchCollection {\n      pagingInfo {\n        next {\n          limit\n          page\n          __typename\n        }\n        __typename\n      }\n      ...SearchCollections_collections\n      __typename\n    }\n    __typename\n  }\n  catalogs(pagingOptions: $pagingOptions, algoliaOptions: $listsSearchOptions) @include(if: $withLists) {\n    ... on SearchCatalog {\n      pagingInfo {\n        next {\n          limit\n          page\n          __typename\n        }\n        __typename\n      }\n      ...SearchLists_catalogs\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n";

  const DETAIL_QUERY = "query PublicationDetail($domainOrSlug: ID!) {\n  publication: collectionByDomainOrSlug(domainOrSlug: $domainOrSlug) {\n    __typename\n    ... on Collection {\n      id\n      name\n      slug\n      domain\n      description\n      subscriberCount\n      tags\n      twitterUsername\n      createdAt\n      ptsQualifiedAt\n      creator {\n        id\n        twitterScreenName\n        __typename\n      }\n      avatar {\n        id\n        __typename\n      }\n      __typename\n    }\n  }\n}\n";

  // --- State ---

  let publications = [];
  let sortField = "subscriberCount";
  let sortAsc = false;
  let stopRequested = false;
  let isRunning = false;

  // --- DOM Refs ---

  const searchInput = document.getElementById("mpd-search-input");
  const maxResultsInput = document.getElementById("mpd-max-results");
  const autoEnrichCheck = document.getElementById("mpd-auto-enrich");
  const searchBtn = document.getElementById("mpd-search-btn");
  const stopBtn = document.getElementById("mpd-stop-btn");
  const statusEl = document.getElementById("mpd-status");
  const controlsEl = document.getElementById("mpd-controls");
  const resultCountEl = document.getElementById("mpd-result-count");
  const tableWrapper = document.getElementById("mpd-table-wrapper");

  // --- GraphQL via Background Script ---

  function sendGraphQL(operations) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "MPD_GRAPHQL", operations },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.success) {
            reject(new Error(response?.error || "Request failed"));
            return;
          }
          resolve(response.data);
        }
      );
    });
  }

  // --- Search ---

  async function searchPublications(query, maxResults) {
    const results = [];
    let page = 0;

    while (results.length < maxResults) {
      if (stopRequested) break;

      updateStatus(
        `Searching... page ${page + 1} (${results.length} found)`,
        results.length / maxResults
      );

      let data;
      try {
        data = await sendGraphQL([
          {
            operationName: "SearchQuery",
            variables: {
              query,
              pagingOptions: { limit: SEARCH_PAGE_SIZE, page },
              withUsers: false,
              withTags: false,
              withPosts: false,
              withCollections: true,
              withLists: false,
              searchInCollection: false,
              collectionDomainOrSlug: "medium.com",
              peopleSearchOptions: {
                filters: "highQualityUser:true OR writtenByHighQulityUser:true",
                numericFilters: "peopleType!=2",
                clickAnalytics: true,
                analyticsTags: ["web-main-content"],
              },
              postsSearchOptions: {
                filters: "writtenByHighQualityUser:true",
                clickAnalytics: true,
                analyticsTags: ["web-main-content"],
              },
              publicationsSearchOptions: {
                clickAnalytics: true,
                analyticsTags: ["web-main-content"],
              },
              tagsSearchOptions: {
                numericFilters: "postCount>=1",
                clickAnalytics: true,
                analyticsTags: ["web-main-content"],
              },
              listsSearchOptions: {
                clickAnalytics: true,
                analyticsTags: ["web-main-content"],
              },
            },
            query: SEARCH_QUERY,
          },
        ]);
      } catch (err) {
        console.error(TAG, "Search failed:", err.message);
        updateStatusError(
          "Search failed: " + err.message + ". Are you logged into Medium?"
        );
        return results;
      }

      // Log raw response for debugging
      console.log(TAG, "Search response page", page, JSON.stringify(data?.[0]).slice(0, 500));

      // Check for GraphQL errors
      if (data?.[0]?.errors) {
        console.error(TAG, "GraphQL errors:", JSON.stringify(data[0].errors));
        updateStatusError("GraphQL error: " + (data[0].errors[0]?.message || "Unknown"));
        return results;
      }

      const collections = data?.[0]?.data?.search?.collections;
      if (!collections || !collections.items || collections.items.length === 0) {
        console.log(TAG, "No more results at page", page, "raw:", JSON.stringify(data?.[0]?.data).slice(0, 300));
        break;
      }

      for (const item of collections.items) {
        // Deduplicate by ID
        if (!results.some((r) => r.id === item.id)) {
          results.push({
            id: item.id,
            name: item.name || "",
            slug: item.slug || "",
            domain: item.domain || null,
            shortDescription: item.shortDescription || "",
            avatarId: item.avatar?.id || null,
            // Detail fields (filled by enrichment)
            description: null,
            subscriberCount: null,
            tags: null,
            twitterUsername: null,
            createdAt: null,
            ptsQualifiedAt: null,
            creatorUsername: null,
            creatorName: null,
            enriched: false,
          });
        }
      }

      if (!collections.pagingInfo?.next) break;
      if (collections.items.length < SEARCH_PAGE_SIZE) break;

      page = collections.pagingInfo.next.page;
      await delay(DELAY_MS);
    }

    return results.slice(0, maxResults);
  }

  // --- Enrichment ---

  async function enrichPublications(pubs) {
    const toEnrich = pubs.filter((p) => !p.enriched);
    if (toEnrich.length === 0) return;

    for (let i = 0; i < toEnrich.length; i += DETAIL_BATCH_SIZE) {
      if (stopRequested) break;

      const batch = toEnrich.slice(i, i + DETAIL_BATCH_SIZE);
      const done = Math.min(i + DETAIL_BATCH_SIZE, toEnrich.length);
      updateStatus(
        `Fetching details... ${done}/${toEnrich.length}`,
        done / toEnrich.length
      );

      // Send enrichment queries one at a time — batching may not work for this resolver
      for (const pub of batch) {
        if (stopRequested) break;

        const lookupKey = pub.domain || pub.slug;
        console.log(TAG, "Enriching:", lookupKey, "(domain:", pub.domain, "slug:", pub.slug, ")");

        try {
          const data = await sendGraphQL([
            {
              operationName: "PublicationDetail",
              variables: { domainOrSlug: lookupKey },
              query: DETAIL_QUERY,
            },
          ]);

          console.log(TAG, "Enrich response for", lookupKey, ":", JSON.stringify(data?.[0]).slice(0, 500));

          const result = data?.[0]?.data?.publication;
          if (!result) {
            console.warn(TAG, "No detail returned for", lookupKey);
            pub.enriched = true;
            continue;
          }

          pub.description = result.description || pub.shortDescription || "";
          pub.subscriberCount = result.subscriberCount ?? null;
          pub.tags = result.tags || null;
          pub.twitterUsername = result.twitterUsername || null;
          pub.createdAt = result.createdAt || null;
          pub.ptsQualifiedAt = result.ptsQualifiedAt || null;
          pub.creatorUsername = result.creator?.twitterScreenName || result.creator?.id || null;
          pub.creatorName = null;
          pub.domain = result.domain || pub.domain;
          pub.enriched = true;
        } catch (err) {
          console.error(TAG, "Enrichment failed for", lookupKey, ":", err.message);
          pub.enriched = true;
        }
      }

      renderTable();
      await delay(DELAY_MS);
    }
  }

  // --- Table Rendering ---

  function getPublicationUrl(pub) {
    if (pub.domain) return "https://" + pub.domain;
    return "https://medium.com/" + pub.slug;
  }

  function formatDate(ts) {
    if (!ts || ts === 0) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  }

  function formatNumber(n) {
    if (n === null || n === undefined) return "-";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toLocaleString();
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTable() {
    if (publications.length === 0) {
      tableWrapper.innerHTML = '<div class="mpd-empty">No results yet</div>';
      return;
    }

    const sorted = getSortedPublications();

    const sortIndicator = (field) => {
      if (sortField !== field) return "";
      return sortAsc ? " &#9650;" : " &#9660;";
    };

    const thClass = (field) =>
      sortField === field ? "mpd-sort-active" : "";

    const rows = sorted
      .map((pub, idx) => {
        const url = getPublicationUrl(pub);
        const tagsStr = pub.tags ? pub.tags.join(", ") : "";
        const enrichClass = pub.enriched ? "" : " mpd-row-enriching";

        return `<tr class="${enrichClass}">
        <td class="mpd-col-idx">${idx + 1}</td>
        <td class="mpd-col-name" title="${escapeHtml(pub.name)}">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(pub.name)}</a>
        </td>
        <td class="mpd-col-num">${formatNumber(pub.subscriberCount)}</td>
        <td class="mpd-col-slug" title="${escapeHtml(pub.slug)}">${escapeHtml(pub.slug)}</td>
        <td class="mpd-col-domain">${pub.domain ? `<a href="https://${escapeHtml(pub.domain)}" target="_blank" rel="noopener">${escapeHtml(pub.domain)}</a>` : ""}</td>
        <td class="mpd-col-desc" title="${escapeHtml(pub.description || pub.shortDescription)}">${escapeHtml(pub.description || pub.shortDescription)}</td>
        <td class="mpd-col-tags" title="${escapeHtml(tagsStr)}">${escapeHtml(tagsStr)}</td>
        <td class="mpd-col-creator">${escapeHtml(pub.creatorUsername || "")}</td>
        <td class="mpd-col-twitter">${pub.twitterUsername ? `<a href="https://x.com/${escapeHtml(pub.twitterUsername)}" target="_blank" rel="noopener">@${escapeHtml(pub.twitterUsername)}</a>` : ""}</td>
        <td class="mpd-col-date">${formatDate(pub.createdAt)}</td>
        <td class="mpd-col-date">${formatDate(pub.ptsQualifiedAt)}</td>
        <td class="mpd-col-pts">${pub.ptsQualifiedAt ? '<span class="mpd-pts-yes">Yes</span>' : ""}</td>
      </tr>`;
      })
      .join("");

    tableWrapper.innerHTML = `
      <table class="mpd-table" id="mpd-table">
        <thead>
          <tr>
            <th class="mpd-col-idx">#</th>
            <th class="${thClass("name")}" data-sort="name">Name${sortIndicator("name")}</th>
            <th class="${thClass("subscriberCount")}" data-sort="subscriberCount">Subscribers${sortIndicator("subscriberCount")}</th>
            <th class="${thClass("slug")}" data-sort="slug">Slug${sortIndicator("slug")}</th>
            <th class="${thClass("domain")}" data-sort="domain">Domain${sortIndicator("domain")}</th>
            <th class="${thClass("shortDescription")}" data-sort="shortDescription">Description${sortIndicator("shortDescription")}</th>
            <th class="${thClass("tags")}" data-sort="tags">Tags${sortIndicator("tags")}</th>
            <th class="${thClass("creatorUsername")}" data-sort="creatorUsername">Creator${sortIndicator("creatorUsername")}</th>
            <th class="${thClass("twitterUsername")}" data-sort="twitterUsername">Twitter${sortIndicator("twitterUsername")}</th>
            <th class="${thClass("createdAt")}" data-sort="createdAt">Created${sortIndicator("createdAt")}</th>
            <th class="${thClass("ptsQualifiedAt")}" data-sort="ptsQualifiedAt">PTS Date${sortIndicator("ptsQualifiedAt")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    bindTableSort();
    updateControls();
  }

  function getSortedPublications() {
    return [...publications].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === "tags") {
        aVal = aVal ? aVal.join(", ") : "";
        bVal = bVal ? bVal.join(", ") : "";
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sortAsc ? cmp : -cmp;
      }

      // Nulls go to the end
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }

  function bindTableSort() {
    const table = document.getElementById("mpd-table");
    if (!table) return;

    table.querySelector("thead").addEventListener("click", (e) => {
      const th = e.target.closest("th");
      if (!th || !th.dataset.sort) return;

      const field = th.dataset.sort;
      if (field === sortField) {
        sortAsc = !sortAsc;
      } else {
        sortField = field;
        sortAsc = field === "name" || field === "slug";
      }

      renderTable();
    });
  }

  // --- Export ---

  function exportJSON() {
    const data = getSortedPublications().map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      domain: p.domain,
      description: p.description || p.shortDescription,
      subscriberCount: p.subscriberCount,
      tags: p.tags,
      twitterUsername: p.twitterUsername,
      creatorUsername: p.creatorUsername,
      creatorName: p.creatorName,
      createdAt: p.createdAt,
      ptsQualifiedAt: p.ptsQualifiedAt,
      avatarId: p.avatarId,
    }));

    downloadFile(
      JSON.stringify(data, null, 2),
      "publications.json",
      "application/json"
    );
  }

  function exportCSV() {
    const headers = [
      "Name",
      "Slug",
      "Domain",
      "Description",
      "Subscribers",
      "Tags",
      "Twitter",
      "Creator",
      "Created",
      "PTS Qualified",
    ];

    const rows = getSortedPublications().map((p) => [
      csvEscape(p.name),
      csvEscape(p.slug),
      csvEscape(p.domain || ""),
      csvEscape(p.description || p.shortDescription || ""),
      p.subscriberCount ?? "",
      csvEscape(p.tags ? p.tags.join("; ") : ""),
      csvEscape(p.twitterUsername || ""),
      csvEscape(p.creatorUsername || ""),
      p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : "",
      p.ptsQualifiedAt ? "Yes" : "No",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    downloadFile(csv, "publications.csv", "text/csv");
  }

  function csvEscape(val) {
    if (!val) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- UI Helpers ---

  function updateStatus(message, progress) {
    let html = escapeHtml(message);
    if (typeof progress === "number" && progress > 0) {
      const pct = Math.round(progress * 100);
      html += `<div class="mpd-progress-bar"><div class="mpd-progress-fill" style="width:${pct}%"></div></div>`;
    }
    statusEl.innerHTML = html;
    statusEl.className = "mpd-status";
  }

  function updateStatusError(message) {
    statusEl.textContent = message;
    statusEl.className = "mpd-status mpd-status-error";
  }

  function clearStatus() {
    statusEl.innerHTML = "";
    statusEl.className = "mpd-status";
  }

  function updateControls() {
    if (publications.length === 0) {
      controlsEl.style.display = "none";
      return;
    }
    controlsEl.style.display = "flex";
    const enriched = publications.filter((p) => p.enriched).length;
    resultCountEl.textContent = `${publications.length} publications (${enriched} with details)`;
  }

  function setRunning(running) {
    isRunning = running;
    searchBtn.disabled = running;
    searchBtn.style.display = running ? "none" : "";
    stopBtn.style.display = running ? "" : "none";
    if (running) {
      stopRequested = false;
    }
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // --- Main Flow ---

  async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    const maxResults = parseInt(maxResultsInput.value) || 100;
    const shouldEnrich = autoEnrichCheck.checked;

    setRunning(true);
    publications = [];
    renderTable();

    console.log(TAG, `Searching "${query}", max ${maxResults}, enrich: ${shouldEnrich}`);

    // Phase 1: Search
    const results = await searchPublications(query, maxResults);
    publications = results;

    console.log(TAG, `Search complete: ${results.length} publications`);

    if (results.length === 0) {
      updateStatusError("No publications found. Check your search term or Medium login.");
      setRunning(false);
      return;
    }

    renderTable();

    // Phase 2: Enrich
    if (shouldEnrich && !stopRequested) {
      await enrichPublications(publications);
      renderTable();
    }

    if (stopRequested) {
      updateStatus(`Stopped. ${publications.length} publications found, ${publications.filter((p) => p.enriched).length} enriched.`);
    } else {
      updateStatus(`Done. ${publications.length} publications found.`);
    }

    setRunning(false);
  }

  // --- Event Listeners ---

  searchBtn.addEventListener("click", handleSearch);
  stopBtn.addEventListener("click", () => {
    stopRequested = true;
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !isRunning) {
      handleSearch();
    }
  });

  document.getElementById("mpd-export-json").addEventListener("click", exportJSON);
  document.getElementById("mpd-export-csv").addEventListener("click", exportCSV);

  // Focus search on load
  searchInput.focus();

  console.log(TAG, "Publications page loaded");
})();
