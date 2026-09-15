import { DailyTask, DSAProblem, InterviewQuestion, MotivationQuote, StudyTopic } from '../src/types';

export const CHALLENGE_START_DATE = '2026-09-15';
export const CHALLENGE_END_DATE = '2026-12-31';
export const TOTAL_CHALLENGE_DAYS = 100;

export function getDateForDay(dayNumber: number): string {
  const start = new Date(2026, 8, 15);
  const target = new Date(start.getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

const quoteTexts = [
  'Consistency beats intensity when intensity cannot be sustained.',
  'Learn deeply enough that you can explain it without your notes.',
  'The difference between knowing and mastering is repetition.',
  'Finish today\'s work before planning tomorrow\'s.',
  'Small progress, repeated every day, becomes an extraordinary result.',
];
export const MOTIVATION_QUOTES: MotivationQuote[] = Array.from({ length: TOTAL_CHALLENGE_DAYS }, (_, index) => ({
  id: `q-${index + 1}`,
  dayNumber: index + 1,
  quote: quoteTexts[index % quoteTexts.length],
  author: 'Anonymous',
  category: 'Discipline',
}));

type CurriculumRow = [number, string, string, string, string];
const rows: CurriculumRow[] = [
[1,'Arrays basics - traversal, prefix sums (3 easy)','Classes, objects, constructors, this','OS functions and types','DBMS advantages and 3-tier architecture'],
[2,'Arrays - rotation, reversal, in-place (3)','Encapsulation, access modifiers, immutability','Process vs program, PCB','Data models and ER overview'],
[3,"Kadane's algorithm and variations (3)",'Inheritance, super, overriding','Process states and transitions','Entities, attributes, attribute types'],
[4,'Two-Sum hashing family (3)','Polymorphism and dynamic dispatch','fork/exec concept','Relationships, cardinality, participation'],
[5,'Sorting and Dutch National Flag (3)','Abstract classes vs interfaces','Processes, threads, multithreading','Library ER diagram practice'],
[6,'Matrix traversal, rotation, spiral (3)','Default/static and functional interfaces','Context switching and overhead','Relations, tuples, domains, schema'],
[7,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[8,'Strings: palindrome, reversal, anagrams (3)','Static members, blocks, singleton','System calls','Keys: super, candidate, primary, foreign'],
[9,'String hashing and pattern matching (3)','Constructor overload and chaining','Interrupts','Integrity constraints'],
[10,'Fixed sliding window (3)','equals, hashCode, toString','Kernel/user mode','Relational algebra: select/project/union'],
[11,'Variable sliding window (3)','OOP hierarchy practice','Process fundamentals quiz','Relational algebra: joins and division'],
[12,'Prefix/suffix and difference arrays (3)','Exception hierarchy','Scheduling criteria','Functional dependencies'],
[13,'Timed arrays and strings set (5)','try/catch/finally and multi-catch','FCFS numericals','Armstrong axioms and closure'],
[14,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[15,'Two pointers: pair sum, container (3)','Custom exceptions','SJF numericals','1NF'],
[16,'3Sum and 4Sum (3)','try-with-resources, AutoCloseable','SRTF numericals','2NF'],
[17,'Binary search fundamentals (3)','Exception chaining and best practices','Priority scheduling and inversion','3NF'],
[18,'Binary search on answer (3)','Runtime exceptions deep dive','Round Robin numericals','BCNF'],
[19,'Rotated arrays and sorted matrices (3)','Refactor exception handling','Multilevel queue','MVD and 4NF'],
[20,'Merge sort and quicksort from scratch','Validator with custom exceptions','Multilevel feedback queue','Lossless join and dependency preservation'],
[21,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[22,'Merge intervals and meeting rooms (3)','Collections hierarchy','Scheduling comparison','Normalize 1NF through BCNF'],
[23,'Counting and bucket sort (3)','ArrayList internals','Scheduling numericals','Normalization timed practice'],
[24,'Cyclic sort: missing/duplicate (3)','LinkedList vs ArrayList','Race conditions and critical section','DDL'],
[25,'Kth largest/smallest, quickselect (2)','HashSet internals','Critical section requirements','DML'],
[26,'Two pointers and sorting (4)','LinkedHashSet and TreeSet','Peterson solution','SELECT filtering'],
[27,'Timed arrays/strings contest (5)','HashMap internals','Mutex locks','LIKE, IN, BETWEEN, NULL'],
[28,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[29,'Singly linked list, reverse, cycle','LinkedHashMap, TreeMap, NavigableMap','Semaphores','Aggregate functions'],
[30,'Merge lists, remove Nth node','ConcurrentHashMap','Semaphore wait/signal','GROUP BY and HAVING'],
[31,'Doubly/circular lists and LRU','Comparable vs Comparator','Monitors','INNER JOIN'],
[32,'Stack, parentheses, min stack','Iterators and fail-fast','Test-and-Set, Compare-and-Swap','Outer joins'],
[33,'Next greater/smaller element','Deque and PriorityQueue','Mutex vs semaphore vs monitor','SELF and CROSS JOIN'],
[34,'Monotonic stack histogram','Collections utilities','Synchronization quiz','Set operations'],
[35,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[36,'Queue, circular queue, deque','Collection decision framework','Producer-consumer','SQL constraints and FK actions'],
[37,'Sliding window maximum','In-memory inventory practice','Dining philosophers','Ten SQL queries'],
[38,'Recursion fundamentals','Generic classes and methods','Readers-writers','Multi-join aggregation'],
[39,'Subsets and permutations','Bounded type parameters','Sleeping barber','Timed SQL test'],
[40,'N-Queens and Sudoku','Wildcards and PECS','Cigarette smokers','Subqueries'],
[41,'Combination sum and word search','Generic interfaces and erasure','Producer-consumer in Java','Nested subqueries'],
[42,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[43,'Expression evaluation with explicit stack','Generic Pair and Stack','Dining philosophers in Java','Views and materialized views'],
[44,'Timed list/stack/queue contest','Generic container library','Classical problems viva','Window ranking functions'],
[45,'Binary tree traversals','Thread vs Runnable','Deadlock conditions','Window partitions and running totals'],
[46,'Level order and tree views','Thread lifecycle and join','Resource allocation graph','Stored procedures'],
[47,'BST insert/delete/search/validate','Synchronized methods and locks','Deadlock prevention','Triggers'],
[48,'BST kth and LCA','Race condition demo/fix','Banker avoidance','CTEs'],
[49,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[50,'Tree LCA, diameter, balance','wait/notify producer-consumer','Banker safety algorithm','String/date functions'],
[51,'Tree construction and serialization','ExecutorService and pools','Banker resource request','CASE statements'],
[52,'Heap and heapify','Callable and Future','Deadlock detection','Advanced window/CTE queries'],
[53,'Kth heap and top-K','ConcurrentHashMap, CopyOnWriteArrayList','Deadlock recovery','Advanced SQL timed test'],
[54,'Merge K lists and running median','ReentrantLock and deadlock','Starvation vs deadlock','Transactions and ACID'],
[55,'Segment/Fenwick tree intro','Bounded producer-consumer','Banker numericals','Logging and durability'],
[56,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[57,'Segment range update/query','Lambdas and functional interfaces','MMU and address translation','Consistency and isolation anomalies'],
[58,'Timed trees/heaps contest','Function, Predicate, Supplier, Consumer','Contiguous allocation','Isolation levels'],
[59,'Graph representations and BFS','Streams basics','Fragmentation and compaction','Serializability'],
[60,'DFS components and cycles','Stream filter/map/sorted','Paging and page tables','Conflict serializability'],
[61,'Directed cycles and topological sort','reduce and Collectors','Paging numericals','View serializability'],
[62,'Union-Find path compression','groupingBy and partitioning','Segmentation','Serializability numericals'],
[63,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[64,'Union-Find islands and Kruskal','Optional map/flatMap','Segmentation with paging','Lock protocols'],
[65,"Dijkstra shortest path",'Method references','TLB numericals','Two-Phase Locking'],
[66,'Bellman-Ford and negative cycles','Parallel streams','Multilevel paging','DBMS deadlock handling'],
[67,'Floyd-Warshall','Loop to streams refactor','Paging recap','Timestamp ordering'],
[68,'Kruskal and Prim MST','File I/O','Virtual memory and demand paging','Thomas write rule'],
[69,'Coloring and bipartite graph','Buffered I/O','Page fault sequence','MVCC'],
[70,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[71,'Bridges and articulation points','Serialization and transient','FIFO replacement','Optimistic concurrency'],
[72,'SCC Tarjan/Kosaraju','NIO Path and Files','Optimal replacement','Concurrency scenarios'],
[73,'Flood fill and clone graph','CSV/JSON I/O','LRU replacement','Indexing basics'],
[74,'Timed graph contest','File note utility','Clock replacement','Dense/sparse indexes'],
[75,'DP memoization/tabulation','JDBC Connection and DriverManager','Belady anomaly','Single/multilevel indexes'],
[76,'House robber and climbing stairs','PreparedStatement','Thrashing and working set','B-trees'],
[77,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[78,'LIS','Queries and ResultSet','Frame allocation','B+ trees'],
[79,"Kadane DP and max product",'Connection pooling','Page replacement numericals','Static hashing'],
[80,'Unique paths and grid DP','JDBC transactions','File system basics','Dynamic hashing'],
[81,'Min path sum and edit distance','JDBC batch processing','File allocation','Index design practice'],
[82,'0/1 knapsack','CallableStatement','Directory structures','Query processing'],
[83,'Unbounded knapsack and coin change','JDBC CRUD console app','Free space management','Query cost estimation'],
[84,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[85,'LCS','Singleton patterns','inodes','Nested loop join'],
[86,'Palindromic substrings and partitioning','Factory patterns','Mounting and journaling','Sort-merge and hash joins'],
[87,'Subset sum and equal partition','Builder pattern','File protection','EXPLAIN plans'],
[88,'Tree DP and bitmask DP','Observer pattern','File allocation numericals','Optimize slow queries'],
[89,'Interval DP','Strategy pattern','I/O, interrupts, DMA','NoSQL overview'],
[90,'Timed DP contest','Adapter and Decorator','Disk structure and latency','CAP theorem'],
[91,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[92,'Bitwise tricks and set bits','Template Method','FCFS/SSTF disk scheduling','SQL vs NoSQL, BASE/ACID'],
[93,'Bitmask subsets and single number','Refactor project with patterns','SCAN/C-SCAN','MongoDB document model'],
[94,'Trie and word break','Plan Library/Inventory capstone','LOOK/C-LOOK','Full ER/normalization revision'],
[95,'Greedy activity and job scheduling','Capstone data model','Disk numericals','SQL revision'],
[96,'Huffman and fractional knapsack','Capstone business logic','Full OS revision','Transactions/concurrency quiz'],
[97,'Graph + DP hard practice','Capstone JDBC persistence','Process/scheduling/sync viva','Index/query optimization quiz'],
[98,'Weekly mock: hardest 5, 90 min','Java recap and flashcards','OS mock viva','DBMS mock viva'],
[99,'Full mixed mock contest','Capstone polish and review','Deadlock/memory/file systems viva','Full DBMS viva'],
[100,'Final weak-area DSA revision','Full Java revision and mock interview','Weak-area deep dive','Weak-area deep dive'],
];

function isRevisionDay(dayNumber: number) { return dayNumber % 7 === 0; }
function makeTopic(subject: StudyTopic['subject'], title: string, dayNumber: number): StudyTopic {
  return { subject, title, description: title, estimatedMinutes: isRevisionDay(dayNumber) ? 60 : 45 };
}

export function generateCurriculum(): { tasks: DailyTask[]; dsaProblems: DSAProblem[]; interviewQuestions: InterviewQuestion[] } {
  const tasks: DailyTask[] = [];
  const dsaProblems: DSAProblem[] = [];
  const interviewQuestions: InterviewQuestion[] = [];

  for (const [dayNumber, dsaTitle, javaTitle, osTitle, dbmsTitle] of rows) {
    const date = getDateForDay(dayNumber);
    const revision = isRevisionDay(dayNumber);
    const question: InterviewQuestion = {
      id: `iq-day-${dayNumber}`,
      question: `Explain the key ideas and trade-offs in: ${javaTitle}.`,
      answerSummary: `Review and explain ${javaTitle} with a small example.`,
      category: revision ? 'REVISION' : 'CORE_JAVA',
      difficulty: revision ? 'MEDIUM' : 'BASIC',
      frequency: 'FREQUENTLY_ASKED',
    };
    interviewQuestions.push(question);
    dsaProblems.push({
      id: `dsa-day-${dayNumber}`,
      dayNumber,
      date,
      title: dsaTitle,
      category: revision ? 'Weekly Mock' : dsaTitle.split(' - ')[0],
      difficulty: revision ? 'HARD' : dayNumber >= 75 ? 'MEDIUM' : 'EASY',
      points: revision ? 4 : 2,
      baseProblemCount: revision ? 5 : 3,
      upperTierProblems: revision ? [] : [`Harder variant: ${dsaTitle}`, `Upper-tier variant: ${dsaTitle}`],
      leetcodeUrl: `https://leetcode.com/problemset/all/?search=${encodeURIComponent(dsaTitle)}`,
      description: revision ? `${dsaTitle}. Both participants complete the same timed mock.` : `Dileep completes the base set. Rahul completes the base set plus two harder problems on the same topic.`,
      approach: `Use the ${dsaTitle} pattern, cover edge cases, and explain correctness before coding.`,
      timeComplexity: 'Explain the complexity of the chosen solution',
      spaceComplexity: 'Explain the auxiliary space used',
    });
    tasks.push({
      id: `task-day-${dayNumber}`,
      dayNumber,
      date,
      category: revision ? 'REVISION' : 'DSA',
      title: `DAY ${dayNumber} - ${revision ? 'Weekly Revision & Mock Test' : 'DSA + Java + OS + DBMS'}`,
      description: revision ? 'DSA timed mock, Java recap, OS mock viva, and DBMS mock viva.' : `Complete the four coordinated tracks. DSA focus: ${dsaTitle}.`,
      learningObjective: revision ? 'Test retention across all four tracks and record weak areas.' : 'Complete the DSA base set and study the Java, OS, and DBMS topics for this day.',
      estimatedMinutes: revision ? 300 : 300,
      difficulty: revision ? 'HARD' : 'MEDIUM',
      priority: 'HIGH',
      badges: revision ? ['Revision', 'Mock Test', 'All Tracks'] : ['DSA', 'Java', 'OS', 'DBMS'],
      resources: [{ title: 'Java Documentation', url: 'https://docs.oracle.com/en/java/', type: 'DOCS' }],
      interviewQuestions: [question],
      studyTopics: [makeTopic('JAVA', javaTitle, dayNumber), makeTopic('OS', osTitle, dayNumber), makeTopic('DBMS', dbmsTitle, dayNumber)],
    });
  }
  return { tasks, dsaProblems, interviewQuestions };
}